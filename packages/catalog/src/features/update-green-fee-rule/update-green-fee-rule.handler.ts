import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { fail, ok, type Result, money } from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';

import { GreenFeeRuleEntity } from '../../persistence/green-fee-rule.entity.js';
import { type GreenFeeRuleResponse } from '../create-green-fee-rule/create-green-fee-rule.contracts.js';
import { toGreenFeeRuleResponse } from '../create-green-fee-rule/create-green-fee-rule.handler.js';
import { UpdateGreenFeeRuleRequest } from './update-green-fee-rule.contracts.js';

@Injectable()
export class UpdateGreenFeeRuleHandler {
  constructor(
    @InjectRepository(GreenFeeRuleEntity, 'catalog')
    private readonly rules: Repository<GreenFeeRuleEntity>,
  ) {}

  async handle(
    greenFeeRuleId: string,
    request: UpdateGreenFeeRuleRequest,
  ): Promise<Result<GreenFeeRuleResponse>> {
    const rule = await this.rules
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
      .where('rule.id = :id', { id: greenFeeRuleId })
      .getOne();
    if (rule === null) return fail('GreenFeeRuleNotFound', 'GreenFeeRule을 찾을 수 없다.');
    if (request.dayType !== undefined) rule.dayType = request.dayType;
    if (request.timeBand !== undefined) rule.timeBand = request.timeBand;
    if (request.amount !== undefined) rule.amount = money(request.amount);
    if (request.priority !== undefined) rule.priority = request.priority;
    if (request.isActive !== undefined) rule.isActive = request.isActive;
    if (rule.amount.isNegative()) return fail('InvalidRequest', 'amount는 0 이상이어야 한다.');
    return ok(toGreenFeeRuleResponse(await this.rules.save(rule)));
  }
}
