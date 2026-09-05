import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateClubRequest {
  @ApiProperty()
  @IsString()
  @Length(1, 100)
  name = '';

  @ApiProperty()
  @IsString()
  @Length(1, 50)
  region = '';

  @ApiProperty({ example: 'Asia/Seoul' })
  @IsString()
  @Length(1, 64)
  timeZone = '';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  address?: string | null;
}

export class ClubResponse {
  @ApiProperty()
  readonly clubId: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly region: string;

  @ApiProperty()
  readonly timeZone: string;

  @ApiProperty({ nullable: true })
  readonly address: string | null;

  @ApiProperty()
  readonly isActive: boolean;

  @ApiProperty({ example: '2026-09-05T00:00:00Z' })
  readonly createdAt: string;

  constructor(input: {
    readonly clubId: string;
    readonly name: string;
    readonly region: string;
    readonly timeZone: string;
    readonly address: string | null;
    readonly isActive: boolean;
    readonly createdAt: string;
  }) {
    this.clubId = input.clubId;
    this.name = input.name;
    this.region = input.region;
    this.timeZone = input.timeZone;
    this.address = input.address;
    this.isActive = input.isActive;
    this.createdAt = input.createdAt;
  }
}
