import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  fail,
  ok,
  type Result,
  DEFAULT_CURRENCY,
  money,
  toAmountString,
} from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';

import { GreenFeeRuleEntity } from '../../persistence/green-fee-rule.entity.js';
import { CourseEntity } from '../../persistence/course.entity.js';
import {
  CreateGreenFeeRuleRequest,
  GreenFeeRuleResponse,
} from './create-green-fee-rule.contracts.js';

@Injectable()
export class CreateGreenFeeRuleHandler {
  constructor(
    @InjectRepository(CourseEntity, 'catalog') private readonly courses: Repository<CourseEntity>,
    @InjectRepository(GreenFeeRuleEntity, 'catalog')
    private readonly rules: Repository<GreenFeeRuleEntity>,
  ) {}

  async handle(request: CreateGreenFeeRuleRequest): Promise<Result<GreenFeeRuleResponse>> {
    if (request.dayType === '' || request.timeBand === '')
      return fail('InvalidRequest', '요일·시간대 구분이 필요하다.');
    const course = await this.courses
      .createQueryBuilder('course')
      .select(['course.id'])
      .where('course.id = :courseId', { courseId: request.courseId })
      .getOne();
    if (course === null) return fail('CourseNotFound', 'Course를 찾을 수 없다.');
    const amount = money(request.amount);
    if (amount.isNegative()) return fail('InvalidRequest', 'amount는 0 이상이어야 한다.');
    const rule = this.rules.create({
      id: crypto.randomUUID(),
      courseId: course.id,
      dayType: request.dayType,
      timeBand: request.timeBand,
      amount,
      currency: DEFAULT_CURRENCY,
      priority: request.priority ?? 0,
      isActive: true,
    });
    return ok(toGreenFeeRuleResponse(await this.rules.save(rule)));
  }
}

export function toGreenFeeRuleResponse(rule: GreenFeeRuleEntity): GreenFeeRuleResponse {
  return new GreenFeeRuleResponse({
    greenFeeRuleId: rule.id,
    courseId: rule.courseId,
    dayType: rule.dayType,
    timeBand: rule.timeBand,
    amount: toAmountString(rule.amount),
    currency: rule.currency,
    priority: rule.priority,
    isActive: rule.isActive,
  });
}
