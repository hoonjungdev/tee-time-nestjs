import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { httpStatusFor, toProblemDetails, type ProblemDetails } from '@teetime/shared-kernel';
import type { Request, Response } from 'express';

import { CourseResponse, CreateCourseRequest } from './create-course.contracts.js';
import { CreateCourseHandler } from './create-course.handler.js';

@ApiTags('admin/courses')
@Controller('api/admin/courses')
// AdminGuard는 의도적으로 붙이지 않는다. M3에서 도입한다(D1).
export class CreateCourseController {
  constructor(private readonly handler: CreateCourseHandler) {}

  @Post()
  @ApiCreatedResponse({ type: CourseResponse })
  async create(
    @Body() request: CreateCourseRequest,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<CourseResponse | ProblemDetails> {
    const result = await this.handler.handle(request);

    if (!result.ok) {
      res.status(httpStatusFor(result.error.code));
      return toProblemDetails(result.error, req.id ?? 'unknown');
    }

    res.status(201);
    return result.value;
  }
}
