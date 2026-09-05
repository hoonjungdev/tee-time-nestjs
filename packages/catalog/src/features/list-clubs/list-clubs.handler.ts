import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ok, type Result } from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';

import { ClubEntity } from '../../persistence/club.entity.js';
import { type ClubResponse } from '../create-club/create-club.contracts.js';
import { toClubResponse } from '../create-club/create-club.handler.js';
import { ListClubsQuery } from './list-clubs.contracts.js';

@Injectable()
export class ListClubsHandler {
  constructor(
    @InjectRepository(ClubEntity, 'catalog') private readonly clubs: Repository<ClubEntity>,
  ) {}

  async handle(query: ListClubsQuery): Promise<Result<ClubResponse[]>> {
    const builder = this.clubs
      .createQueryBuilder('club')
      .select([
        'club.id',
        'club.name',
        'club.region',
        'club.timeZone',
        'club.address',
        'club.isActive',
        'club.createdAt',
      ])
      .orderBy('club.name', 'ASC');

    if (!query.includeInactive) builder.where('club.is_active = :isActive', { isActive: true });
    if (query.region !== undefined)
      builder.andWhere('club.region = :region', { region: query.region });

    return ok((await builder.getMany()).map(toClubResponse));
  }
}
