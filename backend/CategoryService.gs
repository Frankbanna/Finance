/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: CategoryService.gs
 * Description: Manages main categories and subcategories (System + User-defined).
 */

const ALLOWED_CATEGORY_TYPES = ['income', 'expense', 'transfer', 'adjustment'];

/**
 * Lists all active categories visible to the user (SYSTEM + user's own categories).
 */
function handleCategoriesList(ctx, params) {
  const userId = ctx.user.user_id;
  const includeInactive = toBoolean(params && params.include_inactive, false);

  const allRows = readSheetObjects(SHEET_NAMES.CATEGORIES);
  const categories = [];

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    if (row.user_id !== 'SYSTEM' && row.user_id !== userId) continue;
    const isActive = toBoolean(row.is_active, true);
    if (!includeInactive && !isActive) continue;

    categories.push({
      category_id: row.category_id,
      user_id: row.user_id,
      parent_id: row.parent_id || '',
      category_name: row.category_name,
      category_type: row.category_type,
      color: row.color || '#64748B',
      icon: row.icon || 'tag',
      is_system: toBoolean(row.is_system, row.user_id === 'SYSTEM'),
      is_active: isActive,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  }

  return { categories: categories };
}

/**
 * Creates a custom main category or subcategory for the authenticated user.
 */
function handleCategoriesCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const categoryName = requireString(params.category_name, 'ชื่อหมวดหมู่', 80);
    const categoryType = requireEnum(params.category_type, ALLOWED_CATEGORY_TYPES, 'ประเภทหมวดหมู่');
    const parentId = optionalString(params.parent_id, 64);
    const color = optionalString(params.color, 20) || '#3B82F6';
    const icon = optionalString(params.icon, 40) || 'tag';

    const allRows = readSheetObjects(SHEET_NAMES.CATEGORIES);
    if (parentId) {
      let parentFound = false;
      for (let i = 0; i < allRows.length; i++) {
        const r = allRows[i];
        if (r.category_id === parentId && (r.user_id === 'SYSTEM' || r.user_id === userId)) {
          parentFound = true;
          break;
        }
      }
      if (!parentFound) {
        throw createAppError('NOT_FOUND', 'ไม่พบหมวดหมู่หลักที่อ้างอิง', 404);
      }
    }

    const now = nowIso();
    const newCat = {
      category_id: generateId('cat'),
      user_id: userId,
      parent_id: parentId,
      category_name: categoryName,
      category_type: categoryType,
      color: color,
      icon: icon,
      is_system: 'FALSE',
      is_active: 'TRUE',
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.CATEGORIES, newCat);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'categories.create', 'Categories', newCat.category_id, 'สร้างหมวดหมู่: ' + categoryName, newCat);

    return { category: newCat };
  });
}

/**
 * Updates a user-owned category.
 */
function handleCategoriesUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const categoryId = requireString(params.category_id, 'รหัสหมวดหมู่ (category_id)', 64);

    const allRows = readSheetObjects(SHEET_NAMES.CATEGORIES);
    let target = null;
    for (let i = 0; i < allRows.length; i++) {
      if (allRows[i].category_id === categoryId) {
        target = allRows[i];
        break;
      }
    }

    if (!target || (target.user_id !== userId)) {
      throw createAppError('FORBIDDEN', 'ไม่สามารถแก้ไขหมวดหมู่ระบบหรือหมวดหมู่ของผู้อื่นได้', 403);
    }

    if (params.category_name !== undefined) {
      target.category_name = requireString(params.category_name, 'ชื่อหมวดหมู่', 80);
    }
    if (params.color !== undefined) {
      target.color = optionalString(params.color, 20) || target.color;
    }
    if (params.icon !== undefined) {
      target.icon = optionalString(params.icon, 40) || target.icon;
    }
    if (params.is_active !== undefined) {
      target.is_active = toBoolean(params.is_active, true) ? 'TRUE' : 'FALSE';
    }
    target.updated_at = nowIso();

    updateSheetRowByIndex(SHEET_NAMES.CATEGORIES, target._rowIndex, target);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'categories.update', 'Categories', categoryId, 'แก้ไขหมวดหมู่: ' + target.category_name, {});

    return { category: target };
  });
}

