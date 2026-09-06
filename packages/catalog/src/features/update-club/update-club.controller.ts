import { Body, Controller, Param, ParseUUIDPipe, Patch, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { httpStatusFor, toProblemDetails, type ProblemDetails } from '@teetime/shared-kernel';
import type { Request, Response } from 'express';

import { ClubResponse } from '../create-club/create-club.contracts.js';
import { UpdateClubRequest } from './update-club.contracts.js';
import { UpdateClubHandler } from './update-club.handler.js';

@ApiTags('admin/clubs')
@Controller('api/admin/clubs')
// AdminGuard는 의도적으로 붙이지 않는다. M3에서 도입한다(D1).
export class UpdateClubController {
  constructor(private readonly handler: UpdateClubHandler) {}

  @Patch(':clubId')
  @ApiOkResponse({ type: ClubResponse })
  async update(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body() request: UpdateClubRequest,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClubResponse | ProblemDetails> {
    const result = await this.handler.handle(clubId, request);

    if (!result.ok) {
      res.status(httpStatusFor(result.error.code));
      return toProblemDetails(result.error, req.id ?? 'unknown');
    }

    return result.value;
  }
}
