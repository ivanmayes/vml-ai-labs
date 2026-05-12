import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateImageLibrarySchema1747100000000
	implements MigrationInterface
{
	name = 'CreateImageLibrarySchema1747100000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE SCHEMA IF NOT EXISTS "image_library"`,
		);

		await queryRunner.query(`
			CREATE TABLE "image_library"."image_assets" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"organizationId" uuid NOT NULL,
				"spaceId" uuid NOT NULL,
				"userId" uuid NOT NULL,
				"s3Key" character varying(500) NOT NULL,
				"mime" character varying(100) NOT NULL,
				"sizeBytes" integer NOT NULL,
				"originalFilename" character varying(255) NOT NULL,
				"tags" text[] NOT NULL DEFAULT '{}',
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_il_image_assets" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(
			`CREATE INDEX "idx_il_images_org" ON "image_library"."image_assets" ("organizationId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_il_images_space_recent" ON "image_library"."image_assets" ("spaceId", "createdAt" DESC)`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_il_images_tags" ON "image_library"."image_assets" USING GIN ("tags")`,
		);

		await queryRunner.query(
			`ALTER TABLE "image_library"."image_assets" ADD CONSTRAINT "fk_il_image_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "image_library"."image_assets" ADD CONSTRAINT "fk_il_image_space" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "image_library"."image_assets" ADD CONSTRAINT "fk_il_image_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "image_library"."image_assets" DROP CONSTRAINT IF EXISTS "fk_il_image_user"`,
		);
		await queryRunner.query(
			`ALTER TABLE "image_library"."image_assets" DROP CONSTRAINT IF EXISTS "fk_il_image_space"`,
		);
		await queryRunner.query(
			`ALTER TABLE "image_library"."image_assets" DROP CONSTRAINT IF EXISTS "fk_il_image_organization"`,
		);

		await queryRunner.query(
			`DROP TABLE IF EXISTS "image_library"."image_assets"`,
		);

		await queryRunner.query(
			`DROP SCHEMA IF EXISTS "image_library" CASCADE`,
		);
	}
}
