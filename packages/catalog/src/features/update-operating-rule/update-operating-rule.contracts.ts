import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, Matches, Min, Max, ValidateIf } from 'class-validator';
import type { DayType } from '../../pricing/green-fee-policy.js';
import {
  DAY_TYPES,
  TIME_PATTERN,
} from '../create-operating-rule/create-operating-rule.contracts.js';

export class UpdateOperatingRuleRequest {
  @ApiPropertyOptional({ enum: DAY_TYPES })
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsIn(DAY_TYPES)
  dayType?: DayType;

  @ApiPropertyOptional()
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @Matches(TIME_PATTERN)
  openTime?: string;

  @ApiPropertyOptional()
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @Matches(TIME_PATTERN)
  closeTime?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 60 })
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(60)
  intervalMinutes?: number;

  @ApiPropertyOptional()
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
