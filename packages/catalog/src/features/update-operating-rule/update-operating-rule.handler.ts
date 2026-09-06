import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { fail, ok, type Result, LocalTime } from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';
import { violatedConstraint } from '@teetime/persistence-kernel';

import { OperatingRuleEntity } from '../../persistence/operating-rule.entity.js';
import { type OperatingRuleResponse } from '../create-operating-rule/create-operating-rule.contracts.js';
import { toOperatingRuleResponse } from '../create-operating-rule/create-operating-rule.handler.js';
import { UpdateOperatingRuleRequest } from './update-operating-rule.contracts.js';

@Injectable()
export class UpdateOperatingRuleHandler {
  constructor(
    @InjectRepository(OperatingRuleEntity, 'catalog')
    private readonly rules: Repository<OperatingRuleEntity>,
  ) {}

  async handle(
    operatingRuleId: string,
    request: UpdateOperatingRuleRequest,
  ): Promise<Result<OperatingRuleResponse>> {
    const rule = await this.rules
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
      .where('rule.id = :id', { id: operatingRuleId })
      .getOne();
    if (rule === null) return fail('OperatingRuleNotFound', 'OperatingRule을 찾을 수 없다.');
    if (request.dayType !== undefined) rule.dayType = request.dayType;
    if (request.openTime !== undefined) rule.openTime = LocalTime.parse(request.openTime);
    if (request.closeTime !== undefined) rule.closeTime = LocalTime.parse(request.closeTime);
    if (request.intervalMinutes !== undefined) rule.intervalMinutes = request.intervalMinutes;
    if (request.isActive !== undefined) rule.isActive = request.isActive;
    if (!rule.openTime.isBefore(rule.closeTime))
      return fail('InvalidRequest', 'openTime은 closeTime보다 앞서야 한다.');
    if (rule.isActive) {
      const existing = await this.rules
        .createQueryBuilder('rule')
        .select(['rule.id'])
        .where('rule.course_id = :courseId', { courseId: rule.courseId })
        .andWhere('rule.day_type = :dayType', { dayType: rule.dayType })
        .andWhere('rule.is_active = true')
        .andWhere('rule.id <> :id', { id: rule.id })
        .getOne();
      if (existing !== null)
        return fail('OperatingRuleConflict', '활성 OperatingRule이 이미 있다.');
    }
    // 선조회 이후의 경쟁은 부분 유니크 인덱스가 막는다.
    try {
      return ok(toOperatingRuleResponse(await this.rules.save(rule)));
    } catch (error) {
      if (violatedConstraint(error) === 'ux_oprule')
        return fail('OperatingRuleConflict', '활성 OperatingRule이 이미 있다.');
      throw error;
    }
  }
}
