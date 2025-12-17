import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { desc, asc, ilike, or, sql, eq, inArray } from "drizzle-orm";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/db/users
 * Fetch users from database with optional search, pagination, and sorting
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = (page - 1) * limit;
    const sortField = searchParams.get("sortField") || "userId";
    const sortDirection = searchParams.get("sortDirection") || "asc";

    // Build query
    let query = db.select().from(schema.attUsers);

    // Apply search filter if provided (case-insensitive partial match)
    if (search) {
      query = query.where(
        or(
          ilike(schema.attUsers.name, `%${search}%`),
          ilike(schema.attUsers.userId, `%${search}%`)
        )
      ) as typeof query;
    }

    // Get total count with search filter
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(schema.attUsers);
    if (search) {
      countQuery = countQuery.where(
        or(
          ilike(schema.attUsers.name, `%${search}%`),
          ilike(schema.attUsers.userId, `%${search}%`)
        )
      ) as typeof countQuery;
    }
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count || 0);

    // Determine sort column and direction with proper numeric casting
    let orderByExpression;
    switch (sortField) {
      case "userId":
        // Cast userId to integer for numeric sorting (only if it contains only digits)
        orderByExpression = sql`CASE 
          WHEN ${schema.attUsers.userId} ~ '^[0-9]+$' THEN (${schema.attUsers.userId})::integer
          ELSE 0
        END`;
        break;
      case "name":
        orderByExpression = schema.attUsers.name;
        break;
      case "role":
        orderByExpression = schema.attUsers.role;
        break;
      case "cardNo":
        // Cast cardNo to integer for numeric sorting (only if it contains only digits, handle NULL)
        orderByExpression = sql`CASE 
          WHEN ${schema.attUsers.cardNo} IS NOT NULL AND ${schema.attUsers.cardNo} ~ '^[0-9]+$' THEN (${schema.attUsers.cardNo})::integer
          ELSE 0
        END`;
        break;
      case "designation":
        // For designation sorting, we'll need to join with designations table
        // For now, sort by designationId (will be improved with proper join)
        orderByExpression = sql`CASE 
          WHEN ${schema.attUsers.designationId} IS NOT NULL THEN ${schema.attUsers.designationId}
          ELSE 999999
        END`;
        break;
      default:
        // Default to numeric userId sorting
        orderByExpression = sql`CASE 
          WHEN ${schema.attUsers.userId} ~ '^[0-9]+$' THEN (${schema.attUsers.userId})::integer
          ELSE 0
        END`;
    }

    const orderByFn = sortDirection === "desc" ? desc : asc;

    // Get paginated results with sorting
    const users = await query
      .orderBy(orderByFn(orderByExpression))
      .limit(limit)
      .offset(offset);

    // Fetch designations for users that have designationId
    const designationIds = [...new Set(users.filter(u => u.designationId).map(u => u.designationId!))];
    let designationsMap = new Map<number, { name: string; departmentName: string | null }>();
    
    if (designationIds.length > 0) {
      const designations = await db
        .select({
          id: schema.attDesignations.id,
          name: schema.attDesignations.designation,
          departmentId: schema.attDesignations.departmentId,
        })
        .from(schema.attDesignations)
        .where(inArray(schema.attDesignations.id, designationIds));

      // Fetch department names
      const deptIds = [...new Set(designations.filter(d => d.departmentId).map(d => d.departmentId!))];
      let departmentsMap = new Map<number, string>();
      
      if (deptIds.length > 0) {
        const departments = await db
          .select({
            id: schema.attDepartments.id,
            name: schema.attDepartments.name,
          })
          .from(schema.attDepartments)
          .where(inArray(schema.attDepartments.id, deptIds));
        
        departments.forEach(dept => {
          departmentsMap.set(dept.id, dept.name);
        });
      }

      designations.forEach(des => {
        designationsMap.set(des.id, {
          name: des.name,
          departmentName: des.departmentId ? departmentsMap.get(des.departmentId) || null : null,
        });
      });
    }

    // Fetch shifts for users that have shiftId
    const shiftIds = [...new Set(users.filter(u => u.shiftId).map(u => u.shiftId!))];
    let shiftsMap = new Map<number, { name: string; startTime: string; endTime: string }>();

    if (shiftIds.length > 0) {
      const shifts = await db
        .select({
          id: schema.attShifts.id,
          name: schema.attShifts.name,
          startTime: schema.attShifts.startTime,
          endTime: schema.attShifts.endTime,
        })
        .from(schema.attShifts)
        .where(inArray(schema.attShifts.id, shiftIds));

      shifts.forEach(shift => {
        const startTime = String(shift.startTime);
        const endTime = String(shift.endTime);
        shiftsMap.set(shift.id, {
          name: shift.name,
          startTime,
          endTime,
        });
      });
    }

    // Map to frontend format
    const mappedUsers = users.map(user => {
      const designation = user.designationId ? designationsMap.get(user.designationId) : null;
      const shift = user.shiftId ? shiftsMap.get(user.shiftId) : null;
      return {
        id: user.id, // Include database ID for unique key
        uid: parseInt(user.userId) || 0, // Use userId as uid for compatibility
        odoo_uid: parseInt(user.userId) || 0,
        odoo_name: user.name,
        userId: user.userId,
        name: user.name,
        role: user.role || 0,
        password: user.password || "",
        cardNo: user.cardNo || "",
        storedDevices: user.storedDevices || undefined, // Include stored_devices for fingerprint functionality
        designationId: user.designationId || null, // Include designationId
        designation: designation ? designation.name : null, // Include designation name
        designationDepartment: designation?.departmentName || null, // Include department name
        joinDate: user.joinDate || null, // Include join date
        relievingDate: user.relievingDate || null, // Include relieving date
        shiftId: user.shiftId || null, // Include shiftId
        shiftName: shift ? shift.name : null, // Include shift name
        shiftStartTime: shift ? shift.startTime : null, // Include shift start time
        shiftEndTime: shift ? shift.endTime : null, // Include shift end time
      };
    });

    return NextResponse.json<ApiResponse<{ 
      users: typeof mappedUsers; 
      total: number;
      page: number;
      totalPages: number;
    }>>({
      success: true,
      data: {
        users: mappedUsers,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error("Error fetching users from DB:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch users",
    }, { status: 500 });
  }
}

/**
 * PUT /api/db/users
 * Update a user (supports updating designationId, joinDate, and relievingDate)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, designationId, joinDate, relievingDate, name, role, shiftId } = body;

    if (!id) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "User ID is required",
      }, { status: 400 });
    }

    const updates: any = {};
    if (designationId !== undefined) {
      updates.designationId = designationId ? parseInt(designationId) : null;
    }
    if (shiftId !== undefined) {
      updates.shiftId = shiftId ? parseInt(shiftId) : null;
    }
    if (joinDate !== undefined) {
      updates.joinDate = joinDate ? new Date(joinDate) : null;
    }
    if (relievingDate !== undefined) {
      updates.relievingDate = relievingDate ? new Date(relievingDate) : null;
    }
    if (name !== undefined) {
      updates.name = name.trim();
    }
    if (role !== undefined) {
      updates.role = String(role);
    }
    updates.updatedAt = new Date();

    const result = await db
      .update(schema.attUsers)
      .set(updates)
      .where(eq(schema.attUsers.id, parseInt(id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "User not found",
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<typeof result[0]>>({
      success: true,
      data: result[0],
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to update user",
    }, { status: 500 });
  }
}

