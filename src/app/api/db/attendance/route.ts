import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { desc, asc, eq, gte, lte, and, like, ilike, or, sql } from "drizzle-orm";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/db/attendance
 * Fetch attendance logs from database with filters and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const userId = searchParams.get("userId") || "";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const state = searchParams.get("state"); // "0" for check-in, "1" for check-out
    const page = parseInt(searchParams.get("page") || "1");
    let limit = parseInt(searchParams.get("limit") || "100");
    let offset = (page - 1) * limit;
    const sortField = searchParams.get("sortField") || "recordTime";
    const sortDirection = searchParams.get("sortDirection") || "desc";

    // If date range is provided and limit is high (>= 10000), fetch all records
    // This ensures date range queries get complete results without pagination
    if (startDate && endDate && limit >= 10000) {
      limit = 1000000; // Set a very high limit to effectively fetch all records
      offset = 0; // Reset offset to ensure we get all records from the start
    }

    // Build conditions array
    const conditions: any[] = [];

    // Search by user ID or name (case-insensitive partial match)
    if (search) {
      // Get user IDs that match the search term by name (case-insensitive)
      const matchingUsers = await db
        .select({ userId: schema.attUsers.userId })
        .from(schema.attUsers)
        .where(ilike(schema.attUsers.name, `%${search}%`));
      
      const matchingUserIds = matchingUsers.map(u => u.userId);
      
      if (matchingUserIds.length > 0) {
        // Search by user ID OR by matching user names (case-insensitive)
        conditions.push(
          or(
            ilike(schema.attLogs.userId, `%${search}%`),
            sql`${schema.attLogs.userId} IN ${matchingUserIds}`
          )
        );
      } else {
        // No matching names, just search by user ID (case-insensitive)
        conditions.push(ilike(schema.attLogs.userId, `%${search}%`));
      }
    }

    // Filter by specific user ID
    if (userId) {
      conditions.push(eq(schema.attLogs.userId, userId));
    }

    // Date range filters
    if (startDate) {
      const startDateTime = new Date(startDate);
      // Ensure we're comparing UTC dates - set to start of day in UTC
      const startUTC = new Date(Date.UTC(
        startDateTime.getUTCFullYear(),
        startDateTime.getUTCMonth(),
        startDateTime.getUTCDate(),
        0, 0, 0, 0
      ));
      conditions.push(gte(schema.attLogs.recordTime, startUTC));
    }

    if (endDate) {
      const endDateTime = new Date(endDate);
      // Ensure we're comparing UTC dates - set to end of day in UTC
      const endUTC = new Date(Date.UTC(
        endDateTime.getUTCFullYear(),
        endDateTime.getUTCMonth(),
        endDateTime.getUTCDate(),
        23, 59, 59, 999
      ));
      conditions.push(lte(schema.attLogs.recordTime, endUTC));
    }

    // State filter
    if (state !== null && state !== "") {
      conditions.push(eq(schema.attLogs.state, parseInt(state)));
    }

    // Get total count with filters
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(schema.attLogs);
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
    }
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count || 0);

    // Get paginated results
    let query = db.select().from(schema.attLogs);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    // Determine sort column and direction with proper numeric casting for userId
    let orderByExpression;
    switch (sortField) {
      case "userId":
        // Cast userId to integer for numeric sorting (only if it contains only digits)
        orderByExpression = sql`CASE 
          WHEN ${schema.attLogs.userId} ~ '^[0-9]+$' THEN (${schema.attLogs.userId})::integer
          ELSE 0
        END`;
        break;
      case "recordTime":
      case "timestamp":
        orderByExpression = schema.attLogs.recordTime;
        break;
      case "state":
        orderByExpression = schema.attLogs.state;
        break;
      default:
        orderByExpression = schema.attLogs.recordTime;
    }

    const orderByFn = sortDirection === "desc" ? desc : asc;

    const logs = await query
      .orderBy(orderByFn(orderByExpression))
      .limit(limit)
      .offset(offset);

    // Get user names for the logs
    const userIds = [...new Set(logs.map(log => log.userId))];
    const users = userIds.length > 0 
      ? await db
          .select({ userId: schema.attUsers.userId, name: schema.attUsers.name })
          .from(schema.attUsers)
          .where(sql`${schema.attUsers.userId} IN ${userIds}`)
      : [];

    const userMap = new Map(users.map(u => [u.userId, u.name]));

    // Map to frontend format
    const mappedLogs = logs.map((log, index) => ({
      id: log.deviceSn || log.id,
      odoo_uid: parseInt(log.userId) || 0,
      odoo_name: userMap.get(log.userId) || "",
      userId: log.userId,
      timestamp: log.recordTime,
      state: log.state || 0,
      stateLabel: log.state === 1 ? "Check-out" : "Check-in",
    }));

    return NextResponse.json<ApiResponse<{ 
      logs: typeof mappedLogs; 
      total: number;
      page: number;
      totalPages: number;
    }>>({
      success: true,
      data: {
        logs: mappedLogs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error("Error fetching attendance from DB:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch attendance",
    }, { status: 500 });
  }
}

