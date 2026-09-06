import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { fail, ok, type Result, LocalTime } from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';
import { violatedConstraint } from '@teetime/persistence-kernel';

import { OperatingRuleEntity } from '../../persistence/operating-rule.entity.js';
import { CourseEntity } from '../../persistence/course.entity.js';
import {
  CreateOperatingRuleRequest,
  OperatingRuleResponse,
} from './create-operating-rule.contracts.js';

@Injectable()
export class CreateOperatingRuleHandler {
  constructor(
    @InjectRepository(CourseEntity, 'catalog') private readonly courses: Repository<CourseEntity>,
    @InjectRepository(OperatingRuleEntity, 'catalog')
    private readonly rules: Repository<OperatingRuleEntity>,
  ) {}

  async handle(request: CreateOperatingRuleRequest): Promise<Result<OperatingRuleResponse>> {
    if (request.dayType === '') return fail('InvalidRequest', '요일·시간대 구분이 필요하다.');
    const course = await this.courses
      .createQueryBuilder('course')
      .select(['course.id'])
      .where('course.id = :courseId', { courseId: request.courseId })
      .getOne();
    if (course === null) return fail('CourseNotFound', 'Course를 찾을 수 없다.');
    const openTime = LocalTime.parse(request.openTime);
    const closeTime = LocalTime.parse(request.closeTime);
    if (!openTime.isBefore(closeTime))
      return fail('InvalidRequest', 'openTime은 closeTime보다 앞서야 한다.');
    const existing = await this.rules
      .createQueryBuilder('rule')
      .select(['rule.id'])
      .where('rule.course_id = :courseId', { courseId: course.id })
      .andWhere('rule.day_type = :dayType', { dayType: request.dayType })
      .andWhere('rule.is_active = true')
      .getOne();
    if (existing !== null) return fail('OperatingRuleConflict', '활성 OperatingRule이 이미 있다.');
    const rule = this.rules.create({
      id: crypto.randomUUID(),
      courseId: course.id,
      dayType: request.dayType,
      openTime,
      closeTime,
      intervalMinutes: request.intervalMinutes,
      isActive: true,
    });
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

export function toOperatingRuleResponse(rule: OperatingRuleEntity): OperatingRuleResponse {
  return new OperatingRuleResponse({
    operatingRuleId: rule.id,
    courseId: rule.courseId,
    dayType: rule.dayType,
    openTime: rule.openTime.toString(),
    closeTime: rule.closeTime.toString(),
    intervalMinutes: rule.intervalMinutes,
    isActive: rule.isActive,
  });
}
