import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsUUID, Matches, Min, Max } from 'class-validator';
import type { DayType } from '../../pricing/green-fee-policy.js';

export const DAY_TYPES = ['Weekday', 'Weekend'] as const satisfies readonly DayType[];
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class CreateOperatingRuleRequest {
  @ApiProperty()
  @IsUUID()
  courseId: string = '';

  @ApiProperty({ enum: DAY_TYPES })
  @IsIn(DAY_TYPES)
  dayType: DayType | '' = '';

  @ApiProperty({ example: '06:00' })
  @Matches(TIME_PATTERN)
  openTime: string = '';

  @ApiProperty({ example: '18:00' })
  @Matches(TIME_PATTERN)
  closeTime: string = '';

  @ApiProperty({ minimum: 1, maximum: 60 })
  @IsInt()
  @Min(1)
  @Max(60)
  intervalMinutes: number = 0;
}

export class OperatingRuleResponse {
  @ApiProperty()
  readonly operatingRuleId: string;

  @ApiProperty()
  readonly courseId: string;

  @ApiProperty({ enum: DAY_TYPES })
  readonly dayType: DayType;

  @ApiProperty({ example: '06:00' })
  readonly openTime: string;

  @ApiProperty({ example: '18:00' })
  readonly closeTime: string;

  @ApiProperty()
  readonly intervalMinutes: number;

  @ApiProperty()
  readonly isActive: boolean;

  constructor(input: {
    readonly operatingRuleId: string;
    readonly courseId: string;
    readonly dayType: DayType;
    readonly openTime: string;
    readonly closeTime: string;
    readonly intervalMinutes: number;
    readonly isActive: boolean;
  }) {
    this.operatingRuleId = input.operatingRuleId;
    this.courseId = input.courseId;
    this.dayType = input.dayType;
    this.openTime = input.openTime;
    this.closeTime = input.closeTime;
    this.intervalMinutes = input.intervalMinutes;
    this.isActive = input.isActive;
  }
}
