// this was for sqlite

// import { PrismaClient } from '@prisma/client';
// import { PrismaLibSql } from '@prisma/adapter-libsql';

// const globalForPrisma = global as unknown as { prisma: PrismaClient };

// // Initialize the adapter with your database URL
// const adapter = new PrismaLibSql({ 
//   url: process.env.DATABASE_URL || "file:./dev.db" 
// });

// export const prisma =
//   globalForPrisma.prisma ||
//   new PrismaClient({ adapter });

// if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// export default prisma;

// import { PrismaClient } from '@prisma/client';

// const globalForPrisma = global as unknown as { prisma: PrismaClient };

// export const prisma =
//   globalForPrisma.prisma ||
//   new PrismaClient();

// if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// export default prisma;

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;