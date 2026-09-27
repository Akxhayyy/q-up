"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, ApiError } from "@/lib/api-client";
import { createServiceSchema, updateServiceSchema } from "@/lib/validators";

type Service = {
  id: string;
  slug: string;
  name: string;
  code: string;
  description: string | null;
  location: string | null;
  status: "OPEN" | "PAUSED" | "CLOSED";
  isActive: boolean;
};

const emptyForm = { slug: "", name: "", code: "", description: "", location: "" };

function EditRow({ service, onDone }: { service: Service; onDone: () => void }) {
  const [form, setForm] = useState({
    name: service.name,
    code: service.code,
    description: service.description ?? "",
    location: service.location ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = updateServiceSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await apiSend(`/api/admin/services/${service.id}`, "PATCH", parsed.data);
      toast.success("Service updated");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-muted/40 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {errors.name?.map((m) => (
            <p key={m} className="text-xs text-destructive">
              {m}
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Code</Label>
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          {errors.code?.map((m) => (
            <p key={m} className="text-xs text-destructive">
              {m}
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Location</Label>
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Description</Label>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function ServicesManager() {
  const { data, error, isLoading, mutate } = useSWR<Service[]>("/api/admin/services", apiGet);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [createErrors, setCreateErrors] = useState<Record<string, string[]>>({});
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleCreate() {
    const parsed = createServiceSchema.safeParse(createForm);
    if (!parsed.success) {
      setCreateErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    setCreateErrors({});
    setCreating(true);
    try {
      await apiSend("/api/admin/services", "POST", parsed.data);
      toast.success("Service created");
      setCreateForm(emptyForm);
      setShowCreate(false);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(service: Service) {
    setTogglingId(service.id);
    try {
      await apiSend(`/api/admin/services/${service.id}`, "PATCH", { isActive: !service.isActive });
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Manage services</h2>
        <Button size="sm" variant="outline" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Close" : "Add service"}
        </Button>
      </div>

      {showCreate && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g. Library Desk"
              />
              {createErrors.name?.map((m) => (
                <p key={m} className="text-xs text-destructive">
                  {m}
                </p>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Slug</Label>
              <Input
                value={createForm.slug}
                onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                placeholder="e.g. library"
              />
              {createErrors.slug?.map((m) => (
                <p key={m} className="text-xs text-destructive">
                  {m}
                </p>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Code</Label>
              <Input
                value={createForm.code}
                onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                placeholder="e.g. LIB"
              />
              {createErrors.code?.map((m) => (
                <p key={m} className="text-xs text-destructive">
                  {m}
                </p>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Location</Label>
              <Input
                value={createForm.location}
                onChange={(e) => setCreateForm({ ...createForm, location: e.target.value })}
                placeholder="e.g. Library, Ground Floor"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Description</Label>
              <Input
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              />
            </div>
          </div>
          <Button size="sm" disabled={creating} onClick={handleCreate} className="w-fit">
            {creating ? "Creating…" : "Create service"}
          </Button>
        </div>
      )}

      {isLoading && <Skeleton className="h-24 w-full" />}
      {error && (
        <p className="text-sm text-muted-foreground">
          {error instanceof ApiError ? error.message : "Couldn't load services."}
        </p>
      )}

      {data && (
        <div className="flex flex-col divide-y divide-border">
          {data.map((s) => (
            <div key={s.id}>
              <div className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {s.name} <span className="text-xs text-muted-foreground">/{s.slug}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{s.location}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.status === "OPEN" ? "default" : "secondary"}>{s.status}</Badge>
                  <Badge variant={s.isActive ? "outline" : "secondary"}>
                    {s.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(editingId === s.id ? null : s.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={togglingId === s.id}
                    onClick={() => toggleActive(s)}
                  >
                    {s.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
              {editingId === s.id && (
                <EditRow
                  service={s}
                  onDone={() => {
                    setEditingId(null);
                    mutate();
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
