import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ok, type Result } from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';

import { GreenFeeRuleEntity } from '../../persistence/green-fee-rule.entity.js';
import { type GreenFeeRuleResponse } from '../create-green-fee-rule/create-green-fee-rule.contracts.js';
import { toGreenFeeRuleResponse } from '../create-green-fee-rule/create-green-fee-rule.handler.js';
import { ListGreenFeeRulesQuery } from './list-green-fee-rules.contracts.js';

@Injectable()
export class ListGreenFeeRulesHandler {
  constructor(
    @InjectRepository(GreenFeeRuleEntity, 'catalog')
    private readonly rules: Repository<GreenFeeRuleEntity>,
  ) {}

  async handle(query: ListGreenFeeRulesQuery): Promise<Result<GreenFeeRuleResponse[]>> {
    const builder = this.rules
      .createQueryBuilder('rule')
      .select([
        'rule.id',
        'rule.courseId',
        'rule.dayType',
        'rule.timeBand',
        'rule.amount',
        'rule.currency',
        'rule.priority',
        'rule.isActive',
      ])
      .orderBy('rule.courseId', 'ASC')
      .addOrderBy('rule.dayType', 'ASC')
      .addOrderBy('rule.timeBand', 'ASC')
      .addOrderBy('rule.priority', 'DESC');
    if (!query.includeInactive) builder.where('rule.is_active = true');
    if (query.courseId !== undefined)
      builder.andWhere('rule.course_id = :courseId', { courseId: query.courseId });
    return ok((await builder.getMany()).map(toGreenFeeRuleResponse));
  }
}
