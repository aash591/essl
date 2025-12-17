import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { asc, desc, ilike, sql, eq } from "drizzle-orm";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

interface ShiftDto {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapShift(row: typeof schema.attShifts.$inferSelect): ShiftDto {
  return {
    id: row.id,
    name: row.name,
    startTime: String(row.startTime),
    endTime: String(row.endTime),
    isActive: row.isActive,
    createdAt: row.createdAt?.toISOString?.() || new Date(row.createdAt as any).toISOString(),
    updatedAt: row.updatedAt?.toISOString?.() || new Date(row.updatedAt as any).toISOString(),
  };
}

/**
 * GET /api/db/shifts
 * Fetch shifts with optional search and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = (page - 1) * limit;

    // Base query
    let query = db.select().from(schema.attShifts);

    // Search by name (case-insensitive)
    if (search) {
      query = query.where(ilike(schema.attShifts.name, `%${search}%`)) as typeof query;
    }

    // Count query
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(schema.attShifts);
    if (search) {
      countQuery = countQuery.where(ilike(schema.attShifts.name, `%${search}%`)) as typeof countQuery;
    }
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count || 0);

    const rows = await query
      .orderBy(asc(schema.attShifts.name))
      .limit(limit)
      .offset(offset);

    const shifts = rows.map(mapShift);

    const response: ApiResponse<{
      shifts: ShiftDto[];
      total: number;
      totalPages: number;
    }> = {
      success: true,
      data: {
        shifts,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error fetching shifts:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: error?.message || "Failed to fetch shifts",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * POST /api/db/shifts
 * Create a new shift
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, startTime, endTime, isActive } = body;

    if (!name || !name.trim()) {
      const response: ApiResponse<null> = {
        success: false,
        error: "Name is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (!startTime || !endTime) {
      const response: ApiResponse<null> = {
        success: false,
        error: "Start time and end time are required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const [row] = await db
      .insert(schema.attShifts)
      .values({
        name: name.trim(),
        startTime,
        endTime,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      })
      .returning();

    const response: ApiResponse<ShiftDto> = {
      success: true,
      data: mapShift(row),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    console.error("Error creating shift:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: error?.message || "Failed to create shift",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * PUT /api/db/shifts
 * Update an existing shift
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, startTime, endTime, isActive } = body;

    if (!id) {
      const response: ApiResponse<null> = {
        success: false,
        error: "ID is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (startTime !== undefined) updates.startTime = startTime;
    if (endTime !== undefined) updates.endTime = endTime;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    updates.updatedAt = new Date();

    const rows = await db
      .update(schema.attShifts)
      .set(updates)
      .where(eq(schema.attShifts.id, Number(id)))
      .returning();

    if (!rows.length) {
      const response: ApiResponse<null> = {
        success: false,
        error: "Shift not found",
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<ShiftDto> = {
      success: true,
      data: mapShift(rows[0]),
    };
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error updating shift:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: error?.message || "Failed to update shift",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * DELETE /api/db/shifts?id=123
 * Delete a shift
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      const response: ApiResponse<null> = {
        success: false,
        error: "ID is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const existing = await db
      .select()
      .from(schema.attShifts)
      .where(eq(schema.attShifts.id, Number(id)))
      .limit(1);

    if (!existing.length) {
      const response: ApiResponse<null> = {
        success: false,
        error: "Shift not found",
      };
      return NextResponse.json(response, { status: 404 });
    }

    await db
      .delete(schema.attShifts)
      .where(eq(schema.attShifts.id, Number(id)));

    const response: ApiResponse<null> = {
      success: true,
      data: null,
    };
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error deleting shift:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: error?.message || "Failed to delete shift",
    };
    return NextResponse.json(response, { status: 500 });
  }
}


