import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { fail, ok, type Result } from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';

import { ClubEntity } from '../../persistence/club.entity.js';
import { type ClubResponse } from '../create-club/create-club.contracts.js';
import { toClubResponse } from '../create-club/create-club.handler.js';
import { UpdateClubRequest } from './update-club.contracts.js';

@Injectable()
export class UpdateClubHandler {
  constructor(
    @InjectRepository(ClubEntity, 'catalog') private readonly clubs: Repository<ClubEntity>,
  ) {}

  async handle(clubId: string, request: UpdateClubRequest): Promise<Result<ClubResponse>> {
    // Booking 존재 여부를 Catalog가 조회할 수 없으므로 Club은 hard delete하지 않는다.
    const club = await this.clubs.findOneBy({ id: clubId });
    if (club === null) {
      return fail('ClubNotFound', 'Club을 찾을 수 없다.');
    }

    if (request.name !== undefined) club.name = request.name;
    if (request.region !== undefined) club.region = request.region;
    if (request.address !== undefined) club.address = request.address;
    if (request.isActive !== undefined) club.isActive = request.isActive;

    return ok(toClubResponse(await this.clubs.save(club)));
  }
}
