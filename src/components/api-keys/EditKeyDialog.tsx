import { useState, useEffect, FormEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiKey, ApiKeysApi, ApiKeyScope, scopeLabel } from '@/lib/api-keys-client';

interface EditKeyDialogProps {
  apiKey: ApiKey | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  tierAllowsIpAllowlist: boolean;
}

const ALL_SCOPES: ApiKeyScope[] = ['read:basic', 'read:reports', 'read:full', 'read:audit'];

export function EditKeyDialog({ apiKey, open, onOpenChange, onSaved, tierAllowsIpAllowlist }: EditKeyDialogProps) {
  const [name, setName] = useState('');
  const [intendedUse, setIntendedUse] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [ipAllowlist, setIpAllowlist] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (apiKey) {
      setName(apiKey.name);
      setIntendedUse(apiKey.intended_use ?? '');
      setScopes(apiKey.scopes);
      setIpAllowlist((apiKey.ip_allowlist ?? []).join('\n'));
    }
  }, [apiKey]);

  if (!apiKey) return null;

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((prev) => prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!name.trim()) {
      toast.error('Название не может быть пустым');
      return;
    }
    if (scopes.length === 0) {
      toast.error('Выбери хотя бы один scope');
      return;
    }

    let ipList: string[] | null = null;
    if (ipAllowlist.trim()) {
      ipList = ipAllowlist.split(/[,\n]/).map((s) => s.trim()).filter((s) => s.length > 0);
    }

    setSubmitting(true);
    try {
      await ApiKeysApi.patch(apiKey.id, {
        name: name.trim(),
        intended_use: intendedUse.trim() || undefined,
        scopes,
        ip_allowlist: ipList ?? undefined,
      });
      toast.success('Изменения сохранены');
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Не удалось сохранить');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Редактировать ключ</DialogTitle>
          <DialogDescription>
            <code className="text-xs">{apiKey.key_prefix}...{apiKey.key_last4}</code>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit_name">Название</Label>
            <Input
              id="edit_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              disabled={submitting}
            />
          </div>

          <div>
            <Label htmlFor="edit_intended">Назначение</Label>
            <Textarea
              id="edit_intended"
              value={intendedUse}
              onChange={(e) => setIntendedUse(e.target.value)}
              rows={2}
              maxLength={500}
              disabled={submitting}
            />
          </div>

          <div>
            <Label>Scopes</Label>
            <div className="space-y-2 mt-2">
              {ALL_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-3 p-2 border rounded cursor-pointer hover:bg-muted/50">
                  <Checkbox
                    checked={scopes.includes(scope)}
                    onCheckedChange={() => toggleScope(scope)}
                    disabled={submitting}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{scopeLabel(scope)}</div>
                    <code className="text-xs text-primary">{scope}</code>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {tierAllowsIpAllowlist && (
            <div>
              <Label htmlFor="edit_ip">IP allowlist</Label>
              <Textarea
                id="edit_ip"
                value={ipAllowlist}
                onChange={(e) => setIpAllowlist(e.target.value)}
                placeholder="Один IP/CIDR в строке"
                rows={3}
                disabled={submitting}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
