import React, { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImageOff, MoreHorizontal, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import type { MenuCategory, MenuItem } from '../types';
import { useStore } from '../context/StoreContext';
import { ItemEditor } from '../components/ItemEditor';
import { ConfirmDialog, Field, PageSpinner, Sheet, Spinner, adminInput } from '../components/ui';
import { formatMoney } from '../lib/money';
import { friendlyError } from '../utils/errorHandling';

const UNCATEGORIZED = '__uncategorized__';

const sortItems = (a: MenuItem, b: MenuItem) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name);

export const AdminMenu: React.FC = () => {
  const { categories, items, menuLoading } = useStore();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ item: MenuItem | null; categoryId: string } | null>(null);
  const [categoryForm, setCategoryForm] = useState<{ category: MenuCategory | null; name: string; description: string } | null>(null);
  const [categoryMenu, setCategoryMenu] = useState<MenuCategory | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<MenuCategory | null>(null);
  const [busy, setBusy] = useState(false);

  const categoryIds = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);
  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (i: MenuItem) => !q || i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q);
    const list = categories.map((c) => ({ category: c as MenuCategory | null, id: c.id, items: items.filter((i) => i.categoryId === c.id && match(i)).sort(sortItems) }));
    // Items whose category was deleted used to vanish from the admin. Show them so they can be fixed.
    const orphans = items.filter((i) => !categoryIds.has(i.categoryId) && match(i)).sort(sortItems);
    if (orphans.length) list.push({ category: null, id: UNCATEGORIZED, items: orphans });
    return q ? list.filter((s) => s.items.length) : list;
  }, [categories, items, categoryIds, search]);

  const stats = useMemo(
    () => ({
      total: items.length,
      hidden: items.filter((i) => !i.active).length,
      soldOut: items.filter((i) => i.active && i.isSoldOut).length,
      noPhoto: items.filter((i) => i.active && !i.imageUrl).length,
    }),
    [items],
  );

  const quickUpdate = async (item: MenuItem, patch: Partial<MenuItem>, message: string) => {
    try {
      await updateDoc(doc(db, 'items', item.id), patch as Record<string, unknown>);
      toast.success(message, { id: `quick-${item.id}` });
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const moveItem = async (list: MenuItem[], index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const ordered = [...list];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const batch = writeBatch(db);
    ordered.forEach((item, i) => batch.update(doc(db, 'items', item.id), { displayOrder: i }));
    try {
      await batch.commit();
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const moveCategory = async (category: MenuCategory, dir: -1 | 1) => {
    const ordered = [...categories];
    const index = ordered.findIndex((c) => c.id === category.id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const batch = writeBatch(db);
    ordered.forEach((c, i) => batch.update(doc(db, 'categories', c.id), { displayOrder: i }));
    try {
      await batch.commit();
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const saveCategory = async () => {
    if (!categoryForm) return;
    const name = categoryForm.name.trim();
    if (!name) {
      toast.error('Please enter a category name.');
      return;
    }
    setBusy(true);
    try {
      if (categoryForm.category) {
        await updateDoc(doc(db, 'categories', categoryForm.category.id), { name, description: categoryForm.description.trim() });
      } else {
        await addDoc(collection(db, 'categories'), {
          name,
          description: categoryForm.description.trim(),
          active: true,
          displayOrder: categories.reduce((max, c) => Math.max(max, c.displayOrder ?? 0), -1) + 1,
        });
      }
      toast.success('Category saved');
      setCategoryForm(null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteCategory = async () => {
    if (!deleteCategory) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'categories', deleteCategory.id));
      toast.success('Category deleted');
      setDeleteCategory(null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (menuLoading) return <PageSpinner label="Loading menu…" />;

  const itemsInDeleting = deleteCategory ? items.filter((i) => i.categoryId === deleteCategory.id).length : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold">Menu</h1>
          <p className="text-sm text-gray-500">
            {stats.total} items · {stats.soldOut} sold out · {stats.hidden} hidden
            {stats.noPhoto > 0 && ` · ${stats.noPhoto} without photo`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCategoryForm({ category: null, name: '', description: '' })} className="px-4 py-2.5 rounded-2xl bg-white border border-gray-200 font-semibold text-sm flex items-center gap-1.5">
            <Plus size={16} /> Category
          </button>
          <button
            onClick={() => setEditing({ item: null, categoryId: categories[0]?.id || '' })}
            disabled={!categories.length}
            className="px-4 py-2.5 rounded-2xl bg-gray-900 text-white font-semibold text-sm flex items-center gap-1.5 disabled:opacity-40"
            title={categories.length ? undefined : 'Create a category first'}
          >
            <Plus size={16} /> Item
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items" className={`${adminInput} pl-9`} />
      </div>

      {categories.length === 0 && (
        <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-10 text-center">
          <p className="font-semibold mb-1">Start your menu</p>
          <p className="text-sm text-gray-500 mb-4">Create a category (like “Burgers” or “Drinks”), then add items to it.</p>
          <button onClick={() => setCategoryForm({ category: null, name: '', description: '' })} className="px-5 py-3 rounded-2xl bg-gray-900 text-white font-semibold">
            Create first category
          </button>
        </div>
      )}

      {sections.map(({ category, id, items: list }) => (
        <section key={id} className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <div className="min-w-0 flex-1">
              <h2 className={`font-bold truncate ${category && !category.active ? 'text-gray-400 line-through' : ''}`}>{category ? category.name : 'Uncategorized'}</h2>
              <p className="text-xs text-gray-500">
                {category ? (category.active ? `${list.length} items` : 'Hidden from customers') : 'These items are not visible to customers. Move them to a category.'}
              </p>
            </div>
            {category && (
              <>
                <button
                  onClick={() => updateDoc(doc(db, 'categories', category.id), { active: !category.active }).catch((e) => toast.error(friendlyError(e)))}
                  className="p-2 rounded-xl hover:bg-gray-200 text-gray-600"
                  title={category.active ? 'Hide category' : 'Show category'}
                >
                  {category.active ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <button onClick={() => setCategoryMenu(category)} className="p-2 rounded-xl hover:bg-gray-200 text-gray-600" aria-label="Category options">
                  <MoreHorizontal size={18} />
                </button>
              </>
            )}
          </header>

          <ul className="divide-y divide-gray-100">
            {list.map((item, index) => (
              <li key={item.id} className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
                <button onClick={() => setEditing({ item, categoryId: item.categoryId })} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                  <span className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" className={`w-full h-full object-cover ${item.isSoldOut ? 'grayscale' : ''}`} /> : <ImageOff size={18} className="text-gray-300" />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block font-semibold truncate ${item.active ? '' : 'text-gray-400 line-through'}`}>
                      {item.isFeatured && <Star size={13} className="inline mr-1 -mt-0.5 fill-amber-400 text-amber-400" />}
                      {item.name}
                    </span>
                    <span className="block text-sm text-gray-500">
                      {formatMoney(item.basePrice)}
                      {item.modifierGroups?.length ? ` · ${item.modifierGroups.length} option group${item.modifierGroups.length > 1 ? 's' : ''}` : ''}
                      {item.soldCount ? ` · ${item.soldCount} sold` : ''}
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => quickUpdate(item, { isSoldOut: !item.isSoldOut }, item.isSoldOut ? 'Back in stock' : 'Marked sold out')}
                    className={`px-2.5 py-1.5 rounded-full text-xs font-bold ${item.isSoldOut ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
                    title="Toggle sold out"
                  >
                    {item.isSoldOut ? 'Sold out' : 'In stock'}
                  </button>
                  <div className="hidden sm:flex">
                    <button onClick={() => moveItem(list, index, -1)} disabled={index === 0} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-20" aria-label="Move up">
                      <ArrowUp size={15} />
                    </button>
                    <button onClick={() => moveItem(list, index, 1)} disabled={index === list.length - 1} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-20" aria-label="Move down">
                      <ArrowDown size={15} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
            {category && (
              <li>
                <button onClick={() => setEditing({ item: null, categoryId: category.id })} className="w-full px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
                  <Plus size={16} /> Add item to {category.name}
                </button>
              </li>
            )}
          </ul>
        </section>
      ))}

      <ItemEditor
        open={!!editing}
        item={editing?.item || null}
        defaultCategoryId={editing?.categoryId || ''}
        categories={categories}
        nextDisplayOrder={editing ? items.filter((i) => i.categoryId === editing.categoryId).length : 0}
        onClose={() => setEditing(null)}
      />

      <Sheet open={!!categoryMenu} onClose={() => setCategoryMenu(null)} surface="admin" size="sm" title={categoryMenu?.name}>
        {categoryMenu && (
          <div className="p-3">
            {[
              { label: 'Rename / description', icon: Pencil, action: () => setCategoryForm({ category: categoryMenu, name: categoryMenu.name, description: categoryMenu.description || '' }) },
              { label: 'Move up', icon: ArrowUp, action: () => moveCategory(categoryMenu, -1) },
              { label: 'Move down', icon: ArrowDown, action: () => moveCategory(categoryMenu, 1) },
              { label: 'Delete category', icon: Trash2, action: () => setDeleteCategory(categoryMenu), danger: true },
            ].map(({ label, icon: Icon, action, danger }) => (
              <button
                key={label}
                onClick={() => {
                  setCategoryMenu(null);
                  action();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold text-left hover:bg-gray-50 ${danger ? 'text-red-600' : ''}`}
              >
                <Icon size={18} /> {label}
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!categoryForm}
        onClose={() => !busy && setCategoryForm(null)}
        surface="admin"
        size="sm"
        title={categoryForm?.category ? 'Edit category' : 'New category'}
        footer={
          <button onClick={saveCategory} disabled={busy} className="w-full py-3 rounded-2xl bg-gray-900 text-white font-semibold flex items-center justify-center gap-2">
            {busy && <Spinner size={16} />} Save
          </button>
        }
      >
        {categoryForm && (
          <div className="p-5 space-y-4">
            <Field label="Name">
              <input autoFocus value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} className={adminInput} maxLength={99} placeholder="e.g. Burgers" />
            </Field>
            <Field label="Description" hint="Optional. Shown under the category title on the menu.">
              <input value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} className={adminInput} maxLength={300} />
            </Field>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!deleteCategory}
        danger
        busy={busy}
        title={`Delete “${deleteCategory?.name}”?`}
        message={
          itemsInDeleting > 0
            ? `It still contains ${itemsInDeleting} item${itemsInDeleting === 1 ? '' : 's'}. They will move to “Uncategorized” and disappear from the menu until you assign a new category. To just hide it, use the eye button instead.`
            : 'This empty category will be removed.'
        }
        confirmLabel="Delete"
        onCancel={() => setDeleteCategory(null)}
        onConfirm={confirmDeleteCategory}
      />
    </div>
  );
};
