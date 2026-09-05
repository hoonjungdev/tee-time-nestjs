import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { httpStatusFor, toProblemDetails, type ProblemDetails } from '@teetime/shared-kernel';
import type { Request, Response } from 'express';

import { ClubResponse, CreateClubRequest } from './create-club.contracts.js';
import { CreateClubHandler } from './create-club.handler.js';

@ApiTags('admin/clubs')
@Controller('api/admin/clubs')
// AdminGuard는 의도적으로 붙이지 않는다. M3에서 도입한다(D1).
export class CreateClubController {
  constructor(private readonly handler: CreateClubHandler) {}

  @Post()
  @ApiCreatedResponse({ type: ClubResponse })
  async create(
    @Body() request: CreateClubRequest,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClubResponse | ProblemDetails> {
    const result = await this.handler.handle(request);

    if (!result.ok) {
      res.status(httpStatusFor(result.error.code));
      return toProblemDetails(result.error, req.id ?? 'unknown');
    }

    res.status(201);
    return result.value;
  }
}
