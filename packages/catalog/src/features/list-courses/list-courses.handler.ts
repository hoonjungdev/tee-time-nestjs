import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ok, type Result } from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';

import { ClubEntity } from '../../persistence/club.entity.js';
import { CourseEntity } from '../../persistence/course.entity.js';
import { type CourseResponse } from '../create-course/create-course.contracts.js';
import { toCourseResponse } from '../create-course/create-course.handler.js';
import { ListCoursesQuery } from './list-courses.contracts.js';

@Injectable()
export class ListCoursesHandler {
  constructor(
    @InjectRepository(CourseEntity, 'catalog') private readonly courses: Repository<CourseEntity>,
  ) {}

  async handle(query: ListCoursesQuery): Promise<Result<CourseResponse[]>> {
    const builder = this.courses
      .createQueryBuilder('course')
      .select([
        'course.id',
        'course.clubId',
        'course.name',
        'course.holeCount',
        'course.isActive',
        'course.createdAt',
      ])
      .innerJoin(ClubEntity, 'club', 'club.id = course.club_id')
      .orderBy('course.name', 'ASC');

    if (!query.includeInactive) {
      builder.where('course.is_active = :courseActive', { courseActive: true });
      builder.andWhere('club.is_active = :clubActive', { clubActive: true });
    }
    if (query.clubId !== undefined)
      builder.andWhere('course.club_id = :clubId', { clubId: query.clubId });

    return ok((await builder.getMany()).map(toCourseResponse));
  }
}
