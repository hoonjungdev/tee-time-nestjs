import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { Instant } from '@teetime/shared-kernel';
import { instantColumn } from '@teetime/persistence-kernel';

@Entity({ schema: 'catalog', name: 'clubs' })
@Index('ix_clubs_region', ['region'], { where: 'is_active' })
export class ClubEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  region!: string;

  @Column({ type: 'text' })
  timeZone!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamptz', transformer: instantColumn })
  createdAt!: Instant;
}
