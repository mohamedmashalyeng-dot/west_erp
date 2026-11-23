ALTER TABLE "OrganizationSettings"
  ADD COLUMN "facebookPageId" TEXT,
  ADD COLUMN "facebookPageName" TEXT,
  ADD COLUMN "facebookPageAccessToken" TEXT,
  ADD COLUMN "facebookLeadsSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OrganizationSettings_facebookPageId_key"
  ON "OrganizationSettings"("facebookPageId");
