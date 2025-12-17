import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { sql, eq, gte, lte, and } from "drizzle-orm";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/db/stats
 * Fetch full statistics from database (total users, total logs, and today's counts)
 * This endpoint returns complete counts without pagination
 */
export async function GET(request: NextRequest) {
  try {
    // Get total users count (full count, no pagination)
    const usersCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.attUsers);
    const totalUsers = Number(usersCountResult[0]?.count || 0);

    // Get total logs count (full count, no pagination)
    const logsCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.attLogs);
    const totalLogs = Number(logsCountResult[0]?.count || 0);

    // Get today's date range (start of day to end of day)
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Get today's check-ins count (state = 0)
    const todayCheckInsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.attLogs)
      .where(
        and(
          gte(schema.attLogs.recordTime, startOfDay),
          lte(schema.attLogs.recordTime, endOfDay),
          eq(schema.attLogs.state, 0)
        )
      );
    const todayCheckIns = Number(todayCheckInsResult[0]?.count || 0);

    // Get today's check-outs count (state = 1)
    const todayCheckOutsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.attLogs)
      .where(
        and(
          gte(schema.attLogs.recordTime, startOfDay),
          lte(schema.attLogs.recordTime, endOfDay),
          eq(schema.attLogs.state, 1)
        )
      );
    const todayCheckOuts = Number(todayCheckOutsResult[0]?.count || 0);

    return NextResponse.json<ApiResponse<{ 
      totalUsers: number; 
      totalLogs: number; 
      todayCheckIns: number; 
      todayCheckOuts: number;
    }>>({
      success: true,
      data: {
        totalUsers,
        totalLogs,
        todayCheckIns,
        todayCheckOuts,
      },
    });
  } catch (error: any) {
    console.error("Error fetching stats:", error);
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: error?.message || "Failed to fetch statistics",
      },
      { status: 500 }
    );
  }
}

