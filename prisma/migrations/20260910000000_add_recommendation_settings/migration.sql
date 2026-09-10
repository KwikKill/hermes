-- CreateTable
CREATE TABLE "RecommendationSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "halfLifeDays" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "priorAlpha" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "priorBeta" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "maxAgeDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationSettings_pkey" PRIMARY KEY ("id")
);
