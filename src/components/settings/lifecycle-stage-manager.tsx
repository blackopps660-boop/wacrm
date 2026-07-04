'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { GripVertical, Loader2, Plus, Route, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { LifecycleStage } from '@/types';

const STAGE_COLORS = [
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#6b7280',
];

/**
 * Lifecycle stages card — an ordered, colour-coded status per contact
 * (New Lead, Hot Lead, Customer, ...), separate from Pipelines/Deals.
 * Every account starts with four seeded defaults (migration 041); this
 * card lets an admin rename/recolor/reorder/delete them freely.
 *
 * Every edit persists immediately (drag reorder, rename, recolor, the
 * "Lost stage" toggle) — no separate Save button, matching TagManager's
 * inline-card feel rather than PipelineSettings' batched dialog.
 */
export function LifecycleStageManager() {
  const supabase = createClient();
  const { accountId, canEditSettings, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<LifecycleStage[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(STAGE_COLORS[0]);
  const [newIsLost, setNewIsLost] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LifecycleStage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('lifecycle_stages')
        .select('*')
        .eq('account_id', accountId)
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) {
        toast.error('Failed to load lifecycle stages');
      } else {
        setStages((data ?? []) as LifecycleStage[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, supabase]);

  const disabled = !canEditSettings || profileLoading;

  async function handleReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(stages, oldIndex, newIndex);
    setStages(reordered);

    const rows = reordered.map((s, i) => ({ id: s.id, position: i }));
    const { error } = await supabase
      .from('lifecycle_stages')
      .upsert(rows, { onConflict: 'id' });
    if (error) toast.error('Failed to save the new order');
  }

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed || !accountId) return;
    setAdding(true);
    const { data, error } = await supabase
      .from('lifecycle_stages')
      .insert({
        account_id: accountId,
        name: trimmed,
        color: newColor,
        is_lost: newIsLost,
        position: stages.length,
      })
      .select()
      .single();
    setAdding(false);
    if (error || !data) {
      toast.error('Failed to add stage');
      return;
    }
    setStages([...stages, data as LifecycleStage]);
    setNewName('');
    setNewColor(STAGE_COLORS[(stages.length + 1) % STAGE_COLORS.length]);
    setNewIsLost(false);
  }

  async function handleUpdate(id: string, patch: Partial<LifecycleStage>) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { error } = await supabase
      .from('lifecycle_stages')
      .update(patch)
      .eq('id', id);
    if (error) toast.error('Failed to save changes');
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase
      .from('lifecycle_stages')
      .delete()
      .eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast.error('Failed to delete stage');
      return;
    }
    setStages((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success('Stage deleted');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Route className="size-4 text-primary" />
          Lifecycle stages
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Track where each contact stands — New Lead, Hot Lead, Customer,
          and so on. One stage per contact, shown as a filter and column
          on the Contacts page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleReorder}
            >
              <SortableContext
                items={stages.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {stages.map((stage) => (
                    <SortableStageRow
                      key={stage.id}
                      stage={stage}
                      disabled={disabled}
                      onNameChange={(name) => handleUpdate(stage.id, { name })}
                      onColorChange={(color) => handleUpdate(stage.id, { color })}
                      onLostChange={(is_lost) => handleUpdate(stage.id, { is_lost })}
                      onRemove={() => setDeleteTarget(stage)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {stages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No lifecycle stages yet — add your first one below.
              </p>
            )}

            {!disabled && (
              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex flex-wrap gap-1.5">
                  {STAGE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewColor(color)}
                      aria-label={`Use ${color}`}
                      aria-pressed={newColor === color}
                      className={cn(
                        'size-6 rounded-md transition-transform hover:scale-110',
                        newColor === color &&
                          'outline outline-2 outline-offset-2 outline-primary',
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Input
                    placeholder="e.g. Payment Pending"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAdd();
                    }}
                    disabled={adding}
                    maxLength={40}
                    className="min-w-[180px] flex-1"
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={newIsLost}
                      onCheckedChange={setNewIsLost}
                      disabled={adding}
                    />
                    Lost stage
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAdd}
                    disabled={adding || !newName.trim()}
                  >
                    {adding ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Add stage
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete stage</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteTarget?.name}&quot;? Contacts currently in this
              stage become unassigned. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete stage'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SortableStageRow({
  stage,
  disabled,
  onNameChange,
  onColorChange,
  onLostChange,
  onRemove,
}: {
  stage: LifecycleStage;
  disabled: boolean;
  onNameChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onLostChange: (v: boolean) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <ColorSwatch value={stage.color} onChange={onColorChange} disabled={disabled} />
      <Input
        value={stage.name}
        onChange={(e) => onNameChange(e.target.value)}
        disabled={disabled}
        className="h-7 flex-1 border-transparent bg-transparent text-sm text-foreground focus:border-border"
      />
      <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <Switch
          checked={stage.is_lost}
          onCheckedChange={onLostChange}
          disabled={disabled}
        />
        Lost
      </label>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        disabled={disabled}
        className="text-muted-foreground hover:text-red-400"
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}

function ColorSwatch({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="size-4 rounded-full border border-border disabled:cursor-not-allowed"
        style={{ backgroundColor: value }}
        aria-label="Change color"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 flex w-36 flex-wrap gap-1 rounded-lg border border-border bg-popover p-2 shadow-lg">
            {STAGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className="size-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: c === value ? 'var(--foreground)' : 'transparent',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
