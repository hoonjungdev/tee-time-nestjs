import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Instant } from '@teetime/shared-kernel';
import { instantColumn } from '@teetime/persistence-kernel';

import { ClubEntity } from './club.entity.js';

@Entity({ schema: 'catalog', name: 'courses' })
export class CourseEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  clubId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'smallint', default: 18 })
  holeCount!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamptz', transformer: instantColumn })
  createdAt!: Instant;

  @ManyToOne(() => ClubEntity, { nullable: false })
  @JoinColumn({ name: 'club_id' })
  club!: ClubEntity;
}
