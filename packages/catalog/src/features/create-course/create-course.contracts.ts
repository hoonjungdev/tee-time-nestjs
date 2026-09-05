import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, IsUUID, Length, ValidateIf } from 'class-validator';

export class CreateCourseRequest {
  @ApiProperty()
  @IsUUID()
  clubId = '';

  @ApiProperty()
  @IsString()
  @Length(1, 100)
  @ValidateIf((_target, value: unknown) => value !== undefined)
  name = '';

  @ApiPropertyOptional({ enum: [9, 18], default: 18 })
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsInt()
  @IsIn([9, 18])
  holeCount?: number;
}

export class CourseResponse {
  @ApiProperty()
  readonly courseId: string;

  @ApiProperty()
  readonly clubId: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty({ enum: [9, 18] })
  readonly holeCount: number;

  @ApiProperty()
  readonly isActive: boolean;

  @ApiProperty({ example: '2026-09-05T00:00:00Z' })
  readonly createdAt: string;

  constructor(input: {
    readonly courseId: string;
    readonly clubId: string;
    readonly name: string;
    readonly holeCount: number;
    readonly isActive: boolean;
    readonly createdAt: string;
  }) {
    this.courseId = input.courseId;
    this.clubId = input.clubId;
    this.name = input.name;
    this.holeCount = input.holeCount;
    this.isActive = input.isActive;
    this.createdAt = input.createdAt;
  }
}
