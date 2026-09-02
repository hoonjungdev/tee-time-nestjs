import { Module } from '@nestjs/common';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { describe, expect, it } from 'vitest';

import 'reflect-metadata';

@Entity({ schema: 'probe', name: 'probes' })
@Index('ux_probe_partial', ['label'], { unique: true, where: "label <> ''" })
class ProbeEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'text' })
  label!: string;
}

@Module({})
class ProbeModule {}

describe('툴체인 검증', () => {
  it('NestJS 12를 ESM에서 로드한다', () => {
    expect(Reflect.getMetadata('__module:', ProbeModule) ?? ProbeModule.name).toBeDefined();
    expect(ProbeModule.name).toBe('ProbeModule');
  });

  it('emitDecoratorMetadata가 살아 있다 — TypeORM 매핑의 전제', () => {
    const designType = Reflect.getMetadata('design:type', ProbeEntity.prototype, 'label');
    expect(designType).toBe(String);
  });

  it('TypeORM이 엔티티 메타데이터를 수집한다', async () => {
    const { getMetadataArgsStorage } = await import('typeorm');
    const storage = getMetadataArgsStorage();

    const table = storage.tables.find((candidate) => candidate.target === ProbeEntity);
    expect(table?.schema).toBe('probe');

    const partial = storage.indices.find((candidate) => candidate.name === 'ux_probe_partial');
    expect(partial?.unique).toBe(true);
    expect(partial?.where).toBe("label <> ''");
  });
});
