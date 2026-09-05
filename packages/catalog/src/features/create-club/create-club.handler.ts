import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Clock, fail, isValidZoneId, ok, type Result } from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';

import { ClubEntity } from '../../persistence/club.entity.js';
import { ClubResponse, CreateClubRequest } from './create-club.contracts.js';

@Injectable()
export class CreateClubHandler {
  constructor(
    @InjectRepository(ClubEntity, 'catalog') private readonly clubs: Repository<ClubEntity>,
    private readonly clock: Clock,
  ) {}

  async handle(request: CreateClubRequest): Promise<Result<ClubResponse>> {
    if (!isValidZoneId(request.timeZone)) {
      return fail('InvalidRequest', '유효하지 않은 timeZone이다.');
    }

    const club = this.clubs.create({
      id: crypto.randomUUID(),
      name: request.name,
      region: request.region,
      timeZone: request.timeZone,
      address: request.address ?? null,
      isActive: true,
      createdAt: this.clock.now(),
    });
    const saved = await this.clubs.save(club);

    return ok(toClubResponse(saved));
  }
}

export function toClubResponse(club: ClubEntity): ClubResponse {
  return new ClubResponse({
    clubId: club.id,
    name: club.name,
    region: club.region,
    timeZone: club.timeZone,
    address: club.address,
    isActive: club.isActive,
    createdAt: club.createdAt.toString(),
  });
}
