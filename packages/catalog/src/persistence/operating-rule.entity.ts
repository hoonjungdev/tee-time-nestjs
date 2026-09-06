import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { LocalTime } from '@teetime/shared-kernel';
import { localTimeColumn } from '@teetime/persistence-kernel';
import type { DayType } from '../pricing/green-fee-policy.js';

import { CourseEntity } from './course.entity.js';

@Entity({ schema: 'catalog', name: 'operating_rules' })
@Index('ux_oprule', ['courseId', 'dayType'], { unique: true, where: 'is_active' })
export class OperatingRuleEntity {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ type: 'uuid' }) courseId!: string;
  @Column({ type: 'text' }) dayType!: DayType;
  @Column({ type: 'time', transformer: localTimeColumn }) openTime!: LocalTime;
  @Column({ type: 'time', transformer: localTimeColumn }) closeTime!: LocalTime;
  @Column({ type: 'smallint' }) intervalMinutes!: number;
  @Column({ type: 'boolean', default: true }) isActive!: boolean;

  @ManyToOne(() => CourseEntity, { nullable: false })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity;
}
