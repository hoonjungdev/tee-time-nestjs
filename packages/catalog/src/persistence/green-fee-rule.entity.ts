import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { DEFAULT_CURRENCY, type Money } from '@teetime/shared-kernel';
import { moneyColumn } from '@teetime/persistence-kernel';
import type { DayType, TimeBand } from '../pricing/green-fee-policy.js';

import { CourseEntity } from './course.entity.js';

// ix_fee_lookup은 priority DESC를 포함하므로 마이그레이션 raw SQL로만 정의한다.
@Entity({ schema: 'catalog', name: 'green_fee_rules' })
export class GreenFeeRuleEntity {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ type: 'uuid' }) courseId!: string;
  @Column({ type: 'text' }) dayType!: DayType;
  @Column({ type: 'text' }) timeBand!: TimeBand;
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: moneyColumn }) amount!: Money;
  @Column({ type: 'char', length: 3, default: DEFAULT_CURRENCY }) currency!: string;
  @Column({ type: 'smallint', default: 0 }) priority!: number;
  @Column({ type: 'boolean', default: true }) isActive!: boolean;

  @ManyToOne(() => CourseEntity, { nullable: false })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity;
}
