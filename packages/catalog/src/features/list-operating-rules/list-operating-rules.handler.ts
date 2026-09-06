import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ok, type Result } from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';

import { OperatingRuleEntity } from '../../persistence/operating-rule.entity.js';
import { type OperatingRuleResponse } from '../create-operating-rule/create-operating-rule.contracts.js';
import { toOperatingRuleResponse } from '../create-operating-rule/create-operating-rule.handler.js';
import { ListOperatingRulesQuery } from './list-operating-rules.contracts.js';

@Injectable()
export class ListOperatingRulesHandler {
  constructor(
    @InjectRepository(OperatingRuleEntity, 'catalog')
    private readonly rules: Repository<OperatingRuleEntity>,
  ) {}

  async handle(query: ListOperatingRulesQuery): Promise<Result<OperatingRuleResponse[]>> {
    const builder = this.rules
      .createQueryBuilder('rule')
      .select([
        'rule.id',
        'rule.courseId',
        'rule.dayType',
        'rule.openTime',
        'rule.closeTime',
        'rule.intervalMinutes',
        'rule.isActive',
      ])
      .orderBy('rule.courseId', 'ASC')
      .addOrderBy('rule.dayType', 'ASC');
    if (!query.includeInactive) builder.where('rule.is_active = true');
    if (query.courseId !== undefined)
      builder.andWhere('rule.course_id = :courseId', { courseId: query.courseId });
    return ok((await builder.getMany()).map(toOperatingRuleResponse));
  }
}
