import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { desc, asc, ilike, or, sql, eq, isNull, and, inArray } from "drizzle-orm";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/db/designations
 * Fetch departments or designations from database with optional search, pagination
 * Query params:
 *   - type: 'departments' | 'designations' (default: 'designations')
 *   - search: search term
 *   - page: page number (default: 1)
 *   - limit: items per page (default: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") || "designations"; // 'departments' or 'designations'
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = (page - 1) * limit;

    if (type === "departments") {
      // Query departments table
      const conditions: any[] = [];
      
      // Apply search filter if provided (case-insensitive partial match on name)
      if (search) {
        conditions.push(ilike(schema.attDepartments.name, `%${search}%`));
      }

      // Get total count
      let countQuery = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.attDepartments);
      
      if (conditions.length > 0) {
        countQuery = countQuery.where(and(...conditions)) as any;
      }
      
      const countResult = await countQuery;
      const total = Number(countResult[0]?.count || 0);

      // Build query
      let query = db
        .select({
          id: schema.attDepartments.id,
          name: schema.attDepartments.name,
          description: schema.attDepartments.description,
          departmentId: sql<null>`NULL`.as('departmentId'), // null for departments
          createdAt: schema.attDepartments.createdAt,
          updatedAt: schema.attDepartments.updatedAt,
        })
        .from(schema.attDepartments);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      // Get paginated results
      const results = await query
        .orderBy(asc(schema.attDepartments.name))
        .limit(limit)
        .offset(offset);

      const finalResults = results.map((r) => ({
        ...r,
        departmentName: null,
      }));

      const totalPages = Math.ceil(total / limit);

      const response: ApiResponse<{
        designations: typeof finalResults;
        total: number;
        totalPages: number;
      }> = {
        success: true,
        data: {
          designations: finalResults,
          total,
          totalPages,
        },
      };

      return NextResponse.json(response);
    } else {
      // Query designations table
      const conditions: any[] = [];

      // Apply search filter if provided (case-insensitive partial match on designation)
      if (search) {
        conditions.push(ilike(schema.attDesignations.designation, `%${search}%`));
      }

      // Get total count
      let countQuery = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.attDesignations);
      
      if (conditions.length > 0) {
        countQuery = countQuery.where(and(...conditions)) as any;
      }
      
      const countResult = await countQuery;
      const total = Number(countResult[0]?.count || 0);

      // Build query
      let query = db
        .select({
          id: schema.attDesignations.id,
          name: schema.attDesignations.designation, // Map designation to name for compatibility
          designation: schema.attDesignations.designation,
          description: schema.attDesignations.description,
          departmentId: schema.attDesignations.departmentId,
          createdAt: schema.attDesignations.createdAt,
          updatedAt: schema.attDesignations.updatedAt,
        })
        .from(schema.attDesignations);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      // Get paginated results
      const results = await query
        .orderBy(asc(schema.attDesignations.designation))
        .limit(limit)
        .offset(offset);

      // Fetch department names separately
      let finalResults: (typeof results[0] & { departmentName: string | null })[];
      if (results.length > 0) {
        // Get unique department IDs
        const departmentIds = [...new Set(results
          .filter((r) => r.departmentId)
          .map((r) => r.departmentId!))];
        
        if (departmentIds.length > 0) {
          const departments = await db
            .select({
              id: schema.attDepartments.id,
              name: schema.attDepartments.name,
            })
            .from(schema.attDepartments)
            .where(inArray(schema.attDepartments.id, departmentIds));

          const deptMap = new Map(departments.map((d) => [d.id, d.name]));
          finalResults = results.map((r) => ({
            ...r,
            departmentName: r.departmentId ? deptMap.get(r.departmentId) || null : null,
          }));
        } else {
          finalResults = results.map((r) => ({
            ...r,
            departmentName: null,
          }));
        }
      } else {
        finalResults = [];
      }

      const totalPages = Math.ceil(total / limit);

      const response: ApiResponse<{
        designations: typeof finalResults;
        total: number;
        totalPages: number;
      }> = {
        success: true,
        data: {
          designations: finalResults,
          total,
          totalPages,
        },
      };

      return NextResponse.json(response);
    }
  } catch (error: any) {
    console.error("Error fetching designations:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: error?.message || "Failed to fetch designations",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * POST /api/db/designations
 * Create a new department or designation
 * Query params: type: 'departments' | 'designations'
 */
export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") || "designations";
    const body = await request.json();
    const { name, designation, description, departmentId } = body;

    if (type === "departments") {
      // Create department
      if (!name || !name.trim()) {
        const response: ApiResponse<null> = {
          success: false,
          error: "Name is required",
        };
        return NextResponse.json(response, { status: 400 });
      }

      const result = await db
        .insert(schema.attDepartments)
        .values({
          name: name.trim(),
          description: description?.trim() || null,
        })
        .returning();

      const response: ApiResponse<typeof result[0]> = {
        success: true,
        data: result[0],
      };

      return NextResponse.json(response, { status: 201 });
    } else {
      // Create designation
      const designationValue = designation || name;
      if (!designationValue || !designationValue.trim()) {
        const response: ApiResponse<null> = {
          success: false,
          error: "Designation is required",
        };
        return NextResponse.json(response, { status: 400 });
      }

      const result = await db
        .insert(schema.attDesignations)
        .values({
          designation: designationValue.trim(),
          description: description?.trim() || null,
          departmentId: departmentId ? parseInt(departmentId) : null,
        })
        .returning();

      const response: ApiResponse<typeof result[0]> = {
        success: true,
        data: result[0],
      };

      return NextResponse.json(response, { status: 201 });
    }
  } catch (error: any) {
    console.error("Error creating designation:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: error?.message || "Failed to create",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * PUT /api/db/designations
 * Update an existing department or designation
 * Query params: type: 'departments' | 'designations'
 */
export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") || "designations";
    const body = await request.json();
    const { id, name, designation, description, departmentId } = body;

    if (!id) {
      const response: ApiResponse<null> = {
        success: false,
        error: "ID is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (type === "departments") {
      // Update department
      if (!name || !name.trim()) {
        const response: ApiResponse<null> = {
          success: false,
          error: "Name is required",
        };
        return NextResponse.json(response, { status: 400 });
      }

      const result = await db
        .update(schema.attDepartments)
        .set({
          name: name.trim(),
          description: description?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(schema.attDepartments.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        const response: ApiResponse<null> = {
          success: false,
          error: "Department not found",
        };
        return NextResponse.json(response, { status: 404 });
      }

      const response: ApiResponse<typeof result[0]> = {
        success: true,
        data: result[0],
      };

      return NextResponse.json(response);
    } else {
      // Update designation
      const designationValue = designation || name;
      if (!designationValue || !designationValue.trim()) {
        const response: ApiResponse<null> = {
          success: false,
          error: "Designation is required",
        };
        return NextResponse.json(response, { status: 400 });
      }

      const result = await db
        .update(schema.attDesignations)
        .set({
          designation: designationValue.trim(),
          description: description?.trim() || null,
          departmentId: departmentId ? parseInt(departmentId) : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.attDesignations.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        const response: ApiResponse<null> = {
          success: false,
          error: "Designation not found",
        };
        return NextResponse.json(response, { status: 404 });
      }

      const response: ApiResponse<typeof result[0]> = {
        success: true,
        data: result[0],
      };

      return NextResponse.json(response);
    }
  } catch (error: any) {
    console.error("Error updating:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: error?.message || "Failed to update",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * DELETE /api/db/designations?id=123&type=departments|designations
 * Delete a department or designation
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "designations";

    if (!id) {
      const response: ApiResponse<null> = {
        success: false,
        error: "ID is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (type === "departments") {
      // Delete department and all its designations
      const department = await db
        .select()
        .from(schema.attDepartments)
        .where(eq(schema.attDepartments.id, parseInt(id)))
        .limit(1);

      if (department.length === 0) {
        const response: ApiResponse<null> = {
          success: false,
          error: "Department not found",
        };
        return NextResponse.json(response, { status: 404 });
      }

      // Delete all designations under this department first
      await db
        .delete(schema.attDesignations)
        .where(eq(schema.attDesignations.departmentId, parseInt(id)));

      // Delete the department
      await db
        .delete(schema.attDepartments)
        .where(eq(schema.attDepartments.id, parseInt(id)));

      const response: ApiResponse<null> = {
        success: true,
        data: null,
      };

      return NextResponse.json(response);
    } else {
      // Delete designation
      const designation = await db
        .select()
        .from(schema.attDesignations)
        .where(eq(schema.attDesignations.id, parseInt(id)))
        .limit(1);

      if (designation.length === 0) {
        const response: ApiResponse<null> = {
          success: false,
          error: "Designation not found",
        };
        return NextResponse.json(response, { status: 404 });
      }

      // Delete the designation
      await db
        .delete(schema.attDesignations)
        .where(eq(schema.attDesignations.id, parseInt(id)));

      const response: ApiResponse<null> = {
        success: true,
        data: null,
      };

      return NextResponse.json(response);
    }
  } catch (error: any) {
    console.error("Error deleting:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: error?.message || "Failed to delete",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

