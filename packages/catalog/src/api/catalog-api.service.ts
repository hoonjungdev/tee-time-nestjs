import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  CatalogApi,
  type CourseSnapshot,
  type GreenFeeQuote,
  type OperatingDaySnapshot,
} from '@teetime/catalog-contracts';
import {
  ChronoUnit,
  fail,
  ok,
  type LocalDate,
  type LocalTime,
  type Result,
} from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';

import { CourseEntity } from '../persistence/course.entity.js';
import { GreenFeeRuleEntity } from '../persistence/green-fee-rule.entity.js';
import { OperatingRuleEntity } from '../persistence/operating-rule.entity.js';
import {
  quoteGreenFee as quoteFromRules,
  resolveDayType,
  resolveTimeBand,
} from '../pricing/green-fee-policy.js';

type CourseRow = {
  readonly courseId: string;
  readonly clubId: string;
  readonly name: string;
  readonly holeCount: number;
  readonly courseIsActive: boolean;
  readonly clubIsActive: boolean;
  readonly timeZone: string;
};

@Injectable()
export class CatalogApiService extends CatalogApi {
  constructor(
    @InjectRepository(CourseEntity, 'catalog') private readonly courses: Repository<CourseEntity>,
    @InjectRepository(OperatingRuleEntity, 'catalog')
    private readonly operatingRules: Repository<OperatingRuleEntity>,
    @InjectRepository(GreenFeeRuleEntity, 'catalog')
    private readonly greenFeeRules: Repository<GreenFeeRuleEntity>,
  ) {
    super();
  }

  override async getCourse(courseId: string): Promise<Result<CourseSnapshot>> {
    // 이 projection에는 시간·금액 transformer가 필요한 컬럼이 없다.
    const row = await this.courses
      .createQueryBuilder('course')
      .innerJoin('course.club', 'club')
      .select('course.id', 'courseId')
      .addSelect('course.clubId', 'clubId')
      .addSelect('course.name', 'name')
      .addSelect('course.holeCount', 'holeCount')
      .addSelect('course.isActive', 'courseIsActive')
      .addSelect('club.isActive', 'clubIsActive')
      .addSelect('club.timeZone', 'timeZone')
      .where('course.id = :courseId', { courseId })
      .getRawOne<CourseRow>();
    if (row === undefined) return fail('CourseNotFound', 'Course를 찾을 수 없다.');
    return ok({
      courseId: row.courseId,
      clubId: row.clubId,
      name: row.name,
      holeCount: row.holeCount,
      isActive: row.courseIsActive && row.clubIsActive,
      timeZone: row.timeZone,
    });
  }

  override async quoteGreenFee(
    courseId: string,
    teeDate: LocalDate,
    teeTime: LocalTime,
  ): Promise<Result<GreenFeeQuote>> {
    const course = await this.getCourse(courseId);
    if (!course.ok) return course;
    const rules = await this.greenFeeRules
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
      .where('rule.course_id = :courseId', { courseId })
      .andWhere('rule.day_type = :dayType', { dayType: resolveDayType(teeDate) })
      .andWhere('rule.time_band = :timeBand', { timeBand: resolveTimeBand(teeTime) })
      .andWhere('rule.is_active = true')
      .getMany();
    return quoteFromRules({ courseId, teeDate, teeTime, rules });
  }

  override async getOperatingDays(
    courseId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<Result<readonly OperatingDaySnapshot[]>> {
    if (from.isAfter(to) || ChronoUnit.DAYS.between(from, to) > 366) {
      return fail(
        'InvalidRequest',
        '운영일 조회 범위는 순서대로 지정하고 날짜 차이는 366일 이하여야 한다.',
      );
    }
    const course = await this.getCourse(courseId);
    if (!course.ok) return course;
    const rules = await this.operatingRules
      .createQueryBuilder('rule')
      .select(['rule.dayType', 'rule.openTime', 'rule.closeTime', 'rule.intervalMinutes'])
      .where('rule.course_id = :courseId', { courseId })
      .andWhere('rule.is_active = true')
      .getMany();
    const rulesByDayType = new Map(rules.map((rule) => [rule.dayType, rule]));
    const days: OperatingDaySnapshot[] = [];
    for (let date = from; !date.isAfter(to); date = date.plusDays(1)) {
      const rule = rulesByDayType.get(resolveDayType(date));
      if (rule !== undefined) {
        days.push({
          courseId,
          date,
          openTime: rule.openTime,
          closeTime: rule.closeTime,
          intervalMinutes: rule.intervalMinutes,
        });
      }
    }
    return ok(days);
  }
}
