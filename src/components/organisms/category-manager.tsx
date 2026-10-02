"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createCategory,
  createCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
  renameCategory,
  renameCategoryGroup,
  updateCategoryReporting,
} from "@/actions/categories";
import { CategoryIcon } from "@/components/atoms/category-icon";
import { EditableText } from "@/components/molecules/editable-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoryGroup } from "@/queries/categories";

type ActionResult = { success: true } | { error: string };

interface CategoryManagerProps {
  groups: CategoryGroup[];
}

interface DeleteButtonProps {
  label: string;
  description: string;
  disabled: boolean;
  onDelete: () => Promise<ActionResult>;
  onError: (message: string) => void;
  onDeleted: () => void;
}

function DeleteButton({
  label,
  description,
  disabled,
  onDelete,
  onError,
  onDeleted,
}: DeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await onDelete();
      if ("error" in result) {
        onError(result.error);
        return;
      }
      setOpen(false);
      onDeleted();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 hover:text-destructive"
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{label}?</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={confirmDelete}>
              {pending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CategoryManager({ groups }: CategoryManagerProps) {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [isIncome, setIsIncome] = useState(false);
  const [includeTransferInSpending, setIncludeTransferInSpending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedGroupId = groups.some((group) => group.id === groupId)
    ? groupId
    : (groups[0]?.id ?? "");
  const selectedGroupName = groups.find((group) => group.id === selectedGroupId)?.name;

  function refresh() {
    setError(null);
    router.refresh();
  }

  function handleCreateGroup(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createCategoryGroup(groupName);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setGroupName("");
      setGroupId(result.id);
      refresh();
    });
  }

  function handleCreateCategory(event: FormEvent) {
    event.preventDefault();
    if (!selectedGroupId) {
      setError("Create a category group first.");
      return;
    }

    startTransition(async () => {
      const result = await createCategory({
        groupId: selectedGroupId,
        name: categoryName,
        isIncome,
        includeTransferInSpending,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCategoryName("");
      setIsIncome(false);
      setIncludeTransferInSpending(false);
      refresh();
    });
  }

  async function handleRenameGroup(id: string, name: string): Promise<ActionResult> {
    const result = await renameCategoryGroup(id, name);
    if ("error" in result) setError(result.error);
    else refresh();
    return result;
  }

  async function handleRenameCategory(id: string, name: string): Promise<ActionResult> {
    const result = await renameCategory(id, name);
    if ("error" in result) setError(result.error);
    else refresh();
    return result;
  }

  function handleReportingChange(id: string, checked: boolean) {
    startTransition(async () => {
      const result = await updateCategoryReporting(id, checked);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Create category group</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex gap-2" onSubmit={handleCreateGroup}>
              <Input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Group name"
                maxLength={80}
                required
                aria-label="Group name"
              />
              <Button type="submit" size="sm" disabled={pending}>
                <Plus className="size-4" />
                Add group
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Create category</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleCreateCategory}>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="Category name"
                  maxLength={80}
                  required
                  aria-label="Category name"
                />
                <Select
                  value={selectedGroupId}
                  onValueChange={(value) => {
                    if (value !== null) setGroupId(value);
                  }}
                  disabled={groups.length === 0}
                >
                  <SelectTrigger className="w-full" aria-label="Category group">
                    <SelectValue placeholder="Choose group">{selectedGroupName}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={isIncome}
                      onCheckedChange={setIsIncome}
                      aria-label="Income category"
                    />
                    Income category
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={includeTransferInSpending}
                      onCheckedChange={setIncludeTransferInSpending}
                      aria-label="Count transfers in spending reports"
                    />
                    Count transfers in spending reports
                  </label>
                </div>
                <Button type="submit" size="sm" disabled={pending || groups.length === 0}>
                  <Plus className="size-4" />
                  Add category
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <Card key={group.id} size="sm">
            <CardHeader className="border-b">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  {group.isSystem ? (
                    <CardTitle>{group.name}</CardTitle>
                  ) : (
                    <EditableText
                      value={group.name}
                      onSave={(name) => handleRenameGroup(group.id, name)}
                      editLabel={`Rename group ${group.name}`}
                      className="font-heading text-sm font-medium"
                    />
                  )}
                </div>
                <Badge variant={group.isSystem ? "secondary" : "outline"}>
                  {group.isSystem ? "System" : "Custom"}
                </Badge>
                {!group.isSystem && (
                  <DeleteButton
                    label={`Delete ${group.name}`}
                    description="Only empty custom groups can be deleted."
                    disabled={pending}
                    onDelete={() => deleteCategoryGroup(group.id)}
                    onError={setError}
                    onDeleted={refresh}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent className="divide-y px-0">
              {group.categories.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">No categories in this group.</p>
              ) : (
                group.categories.map((category) => (
                  <div key={category.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
                    <CategoryIcon name={category.icon} size={16} className="text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      {category.isSystem ? (
                        <span className="text-sm font-medium">{category.name}</span>
                      ) : (
                        <EditableText
                          value={category.name}
                          onSave={(name) => handleRenameCategory(category.id, name)}
                          editLabel={`Rename category ${category.name}`}
                          className="text-sm font-medium"
                        />
                      )}
                    </div>
                    {!category.isSystem && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={category.includeTransferInSpending}
                          onCheckedChange={(checked) =>
                            handleReportingChange(category.id, checked)
                          }
                          aria-label={`Count transfers in spending reports for ${category.name}`}
                          disabled={pending}
                        />
                        Count transfers in spending reports
                      </label>
                    )}
                    {category.isIncome && <Badge variant="secondary">Income</Badge>}
                    <Badge variant={category.isSystem ? "secondary" : "outline"}>
                      {category.isSystem ? "System" : "Custom"}
                    </Badge>
                    {!category.isSystem && (
                      <DeleteButton
                        label={`Delete ${category.name}`}
                        description="Categories used by transactions, rules, budgets, merchants, or recurring transactions cannot be deleted."
                        disabled={pending}
                        onDelete={() => deleteCategory(category.id)}
                        onError={setError}
                        onDeleted={refresh}
                      />
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        System categories are read-only. Custom categories remain available everywhere categories
        are used, including transactions, rules, budgets, reports, merchants, and recurring items.
      </p>
    </div>
  );
}
