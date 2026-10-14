-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "suburb" TEXT NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "website" TEXT,
    "placeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Uncontacted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_placeId_key" ON "Lead"("placeId");
