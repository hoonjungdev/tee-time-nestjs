import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { httpStatusFor, toProblemDetails, type ProblemDetails } from '@teetime/shared-kernel';
import type { Request, Response } from 'express';

import { CourseResponse } from '../create-course/create-course.contracts.js';
import { ListCoursesQuery } from './list-courses.contracts.js';
import { ListCoursesHandler } from './list-courses.handler.js';

@ApiTags('admin/courses')
@Controller('api/admin/courses')
// AdminGuard는 의도적으로 붙이지 않는다. M3에서 도입한다(D1).
export class ListCoursesController {
  constructor(private readonly handler: ListCoursesHandler) {}

  @Get()
  @ApiOkResponse({ type: CourseResponse, isArray: true })
  async list(
    @Query() query: ListCoursesQuery,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<CourseResponse[] | ProblemDetails> {
    const result = await this.handler.handle(query);

    if (!result.ok) {
      res.status(httpStatusFor(result.error.code));
      return toProblemDetails(result.error, req.id ?? 'unknown');
    }

    return result.value;
  }
}
