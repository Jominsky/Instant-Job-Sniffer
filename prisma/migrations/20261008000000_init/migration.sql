CREATE TYPE "CompanyCategory" AS ENUM ('BIG_TECH', 'QUANT', 'HEDGE_FUND', 'PROP_TRADING', 'FINTECH', 'FORTUNE_500', 'STARTUP', 'HEALTHCARE', 'FINANCE', 'OTHER');

CREATE TYPE "CompanyPriority" AS ENUM ('P0', 'P1', 'P2', 'P3');

CREATE TYPE "AtsProvider" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY', 'WORKDAY', 'SMARTRECRUITERS', 'JOBVITE', 'ICIMS', 'SUCCESSFACTORS', 'GENERIC_CAREERS_PAGE', 'RSS_FEED', 'UNKNOWN');

CREATE TYPE "ExperienceLevel" AS ENUM ('INTERNSHIP', 'NEW_GRAD', 'ENTRY_LEVEL', 'EXPERIENCED', 'UNKNOWN');

CREATE TYPE "RoleCategory" AS ENUM ('SWE', 'BACKEND', 'FRONTEND', 'FULL_STACK', 'INFRASTRUCTURE', 'DISTRIBUTED_SYSTEMS', 'ML_AI', 'DATA_ENGINEERING', 'QUANT_DEVELOPER', 'QUANT_RESEARCH', 'QUANT_TRADING', 'DEVOPS_SRE', 'SECURITY', 'PRODUCT', 'OTHER');

CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ON_SITE', 'UNKNOWN');

CREATE TYPE "PostingStatus" AS ENUM ('OPEN', 'POSSIBLY_CLOSED', 'CLOSED', 'APPLICATION_REMOVED');

CREATE TYPE "DataProvenance" AS ENUM ('OFFICIAL_COMPANY_PAGE', 'ATS', 'SEARCH_DISCOVERY', 'AI_INFERENCE', 'USER_INPUT');

CREATE TYPE "ApplicationStatus" AS ENUM ('DISCOVERED', 'INTERESTED', 'SAVED', 'APPLYING', 'APPLIED', 'OA_RECEIVED', 'OA_COMPLETED', 'RECRUITER_SCREEN', 'TECHNICAL_INTERVIEW', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN');

CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'BROWSER', 'PUSH', 'SMS', 'DISCORD', 'SLACK');

CREATE TYPE "DigestFrequency" AS ENUM ('IMMEDIATE', 'HOURLY', 'MORNING', 'EVENING');

CREATE TYPE "ScanStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILURE');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "calendarTokenHash" TEXT,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Profile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "skills" TEXT[],
  "languages" TEXT[],
  "technologies" TEXT[],
  "majors" TEXT[],
  "graduationYear" INTEGER,
  "preferredRoles" TEXT[],
  "preferredLocations" TEXT[],
  "preferredCompanies" TEXT[],
  "preferredIndustries" TEXT[],
  "targetSeason" TEXT NOT NULL DEFAULT 'Summer',
  "targetYear" INTEGER NOT NULL DEFAULT 2027,
  "sponsorshipRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "keywords" TEXT[],
  "excludedKeywords" TEXT[],
  "minCompensation" INTEGER,
  "weightRoleRelevance" INTEGER NOT NULL DEFAULT 30,
  "weightExperienceElig" INTEGER NOT NULL DEFAULT 20,
  "weightSkillsMatch" INTEGER NOT NULL DEFAULT 20,
  "weightCompanyPref" INTEGER NOT NULL DEFAULT 10,
  "weightLocationPref" INTEGER NOT NULL DEFAULT 10,
  "weightResumeSimilarity" INTEGER NOT NULL DEFAULT 10,
  "exclusionRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Resume" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "fileUrl" TEXT,
  "extractedText" TEXT,
  "skills" TEXT[],
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "logoUrl" TEXT,
  "website" TEXT,
  "careersUrl" TEXT,
  "atsProvider" "AtsProvider" NOT NULL DEFAULT 'UNKNOWN',
  "atsIdentifier" TEXT,
  "industry" TEXT,
  "category" "CompanyCategory" NOT NULL DEFAULT 'OTHER',
  "priority" "CompanyPriority" NOT NULL DEFAULT 'P2',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "lastCheckedAt" TIMESTAMP(3),
  "lastSuccessfulScanAt" TIMESTAMP(3),
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "openMatchingJobsCount" INTEGER NOT NULL DEFAULT 0,
  "totalJobsDiscovered" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "tags" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyList" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isBuiltIn" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyListMember" (
  "id" TEXT NOT NULL,
  "companyListId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  CONSTRAINT "CompanyListMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Job" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "normalizedTitle" TEXT NOT NULL,
  "location" TEXT,
  "workMode" "WorkMode" NOT NULL DEFAULT 'UNKNOWN',
  "experienceLevel" "ExperienceLevel" NOT NULL DEFAULT 'UNKNOWN',
  "roleCategory" "RoleCategory" NOT NULL DEFAULT 'OTHER',
  "department" TEXT,
  "description" TEXT NOT NULL,
  "qualifications" TEXT,
  "preferredQualifications" TEXT,
  "technologies" TEXT[],
  "compensationMin" INTEGER,
  "compensationMax" INTEGER,
  "compensationRaw" TEXT,
  "compensationPeriod" TEXT,
  "compensationAnnualMax" INTEGER,
  "applicationUrl" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "ats" "AtsProvider" NOT NULL,
  "source" TEXT NOT NULL,
  "externalJobId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "datePosted" TIMESTAMP(3),
  "firstDiscoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applicationDeadline" TIMESTAMP(3),
  "targetSeason" TEXT,
  "targetYear" INTEGER,
  "seasonProvenance" "DataProvenance" NOT NULL DEFAULT 'AI_INFERENCE',
  "classificationProvenance" "DataProvenance" NOT NULL DEFAULT 'AI_INFERENCE',
  "graduationRequirement" TEXT,
  "citizenshipRequirement" TEXT,
  "sponsorshipInfo" TEXT,
  "schoolYearRequirement" TEXT,
  "fitScore" INTEGER,
  "fitExplanation" JSONB,
  "concerns" JSONB,
  "urgencyScore" INTEGER,
  "isExcluded" BOOLEAN NOT NULL DEFAULT FALSE,
  "exclusionReasons" TEXT[],
  "status" "PostingStatus" NOT NULL DEFAULT 'OPEN',
  "postingHash" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isReposted" BOOLEAN NOT NULL DEFAULT FALSE,
  "reopenedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "missedScans" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobSource" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "ats" "AtsProvider" NOT NULL,
  "source" TEXT NOT NULL,
  "externalJobId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobVersion" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "diff" JSONB,
  "postingHash" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Application" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'DISCOVERED',
  "dateDiscovered" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dateApplied" TIMESTAMP(3),
  "resumeId" TEXT,
  "referral" BOOLEAN NOT NULL DEFAULT FALSE,
  "referralContactId" TEXT,
  "recruiter" TEXT,
  "applicationEmail" TEXT,
  "applicationAccountEmail" TEXT,
  "oaDeadline" TIMESTAMP(3),
  "interviewDates" TIMESTAMP(3)[],
  "notes" TEXT,
  "followUpDate" TIMESTAMP(3),
  "result" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationStatusChange" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "status" "ApplicationStatus" NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationStatusChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "notInterested" BOOLEAN NOT NULL DEFAULT FALSE,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Contact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT,
  "name" TEXT NOT NULL,
  "position" TEXT,
  "linkedinUrl" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "alumniConnection" BOOLEAN NOT NULL DEFAULT FALSE,
  "schoolConnection" BOOLEAN NOT NULL DEFAULT FALSE,
  "fraternityConnection" BOOLEAN NOT NULL DEFAULT FALSE,
  "referralRequested" BOOLEAN NOT NULL DEFAULT FALSE,
  "referralReceived" BOOLEAN NOT NULL DEFAULT FALSE,
  "lastContactedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Watchlist" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filterJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Alert" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "watchlistId" TEXT,
  "name" TEXT NOT NULL,
  "ruleJson" JSONB NOT NULL,
  "channels" "NotificationChannel"[],
  "frequency" "DigestFrequency" NOT NULL DEFAULT 'IMMEDIATE',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "lastDigestAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlertEvent" (
  "id" TEXT NOT NULL,
  "alertId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT 'new',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "channelResults" JSONB,
  CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "jobId" TEXT,
  "alertId" TEXT,
  "read" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedAnswer" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "tags" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedAnswer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedSearch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query" TEXT,
  "filterJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScanRun" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "connector" TEXT NOT NULL,
  "status" "ScanStatus" NOT NULL DEFAULT 'RUNNING',
  "jobsFound" INTEGER NOT NULL DEFAULT 0,
  "jobsNew" INTEGER NOT NULL DEFAULT 0,
  "jobsUpdated" INTEGER NOT NULL DEFAULT 0,
  "jobsClosed" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ScanRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX "User_calendarTokenHash_key" ON "User"("calendarTokenHash");

CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

CREATE INDEX "Company_priority_idx" ON "Company"("priority");

CREATE INDEX "Company_isActive_lastCheckedAt_idx" ON "Company"("isActive", "lastCheckedAt");

CREATE INDEX "Company_category_idx" ON "Company"("category");

CREATE UNIQUE INDEX "CompanyListMember_companyListId_companyId_key" ON "CompanyListMember"("companyListId", "companyId");

CREATE UNIQUE INDEX "Job_companyId_ats_externalJobId_key" ON "Job"("companyId", "ats", "externalJobId");

CREATE INDEX "Job_dedupeKey_idx" ON "Job"("dedupeKey");

CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");

CREATE INDEX "Job_datePosted_idx" ON "Job"("datePosted");

CREATE INDEX "Job_firstDiscoveredAt_idx" ON "Job"("firstDiscoveredAt");

CREATE INDEX "Job_status_idx" ON "Job"("status");

CREATE INDEX "Job_roleCategory_idx" ON "Job"("roleCategory");

CREATE INDEX "Job_fitScore_idx" ON "Job"("fitScore");

CREATE INDEX "Job_normalizedTitle_idx" ON "Job"("normalizedTitle");

CREATE INDEX "Job_isExcluded_idx" ON "Job"("isExcluded");

CREATE UNIQUE INDEX "JobSource_jobId_source_externalJobId_key" ON "JobSource"("jobId", "source", "externalJobId");

CREATE INDEX "JobVersion_jobId_idx" ON "JobVersion"("jobId");

CREATE UNIQUE INDEX "Application_userId_jobId_key" ON "Application"("userId", "jobId");

CREATE INDEX "Application_status_idx" ON "Application"("status");

CREATE INDEX "ApplicationStatusChange_applicationId_idx" ON "ApplicationStatusChange"("applicationId");

CREATE UNIQUE INDEX "SavedJob_userId_jobId_key" ON "SavedJob"("userId", "jobId");

CREATE UNIQUE INDEX "AlertEvent_alertId_jobId_key" ON "AlertEvent"("alertId", "jobId");

CREATE INDEX "AlertEvent_status_idx" ON "AlertEvent"("status");

CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

CREATE INDEX "SavedAnswer_userId_idx" ON "SavedAnswer"("userId");

CREATE INDEX "ScanRun_companyId_idx" ON "ScanRun"("companyId");

CREATE INDEX "ScanRun_status_idx" ON "ScanRun"("status");

CREATE INDEX "ScanRun_startedAt_idx" ON "ScanRun"("startedAt");

ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyList" ADD CONSTRAINT "CompanyList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyListMember" ADD CONSTRAINT "CompanyListMember_companyListId_fkey" FOREIGN KEY ("companyListId") REFERENCES "CompanyList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyListMember" ADD CONSTRAINT "CompanyListMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobSource" ADD CONSTRAINT "JobSource_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobVersion" ADD CONSTRAINT "JobVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApplicationStatusChange" ADD CONSTRAINT "ApplicationStatusChange_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Alert" ADD CONSTRAINT "Alert_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedAnswer" ADD CONSTRAINT "SavedAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScanRun" ADD CONSTRAINT "ScanRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
