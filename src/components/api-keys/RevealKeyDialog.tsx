import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface RevealKeyDialogProps {
  open: boolean;
  plainKey: string;
  keyName: string;
  isRotation?: boolean;
  overlapDays?: number;
  onAcknowledge: () => void;
}

export function RevealKeyDialog({ open, plainKey, keyName, isRotation, overlapDays, onAcknowledge }: RevealKeyDialogProps) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL ?? 'https://ldyshcvwxfzvfjrkcfgw.supabase.co';
  const curlSnippet = `curl -H "Authorization: Bearer ${plainKey}" \\\n  ${supabaseUrl}/functions/v1/bot-api/active-now`;

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(plainKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
      toast.success('Ключ скопирован');
    } catch {
      toast.error('Не удалось скопировать. Выделите вручную');
    }
  };

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlSnippet);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
      toast.success('curl-команда скопирована');
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const handleClose = () => {
    if (!acknowledged) return;
    onAcknowledge();
    setAcknowledged(false);
    setCopiedKey(false);
    setCopiedCurl(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            {isRotation ? 'Ключ ротирован' : 'API-ключ создан'}
          </DialogTitle>
          <DialogDescription>
            «{keyName}» — это <strong>единственный раз</strong>, когда виден полный ключ. Сохрани его сейчас.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isRotation && overlapDays && (
            <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/30">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <AlertDescription className="text-sm">
                Старый ключ продолжает работать ещё <strong>{overlapDays} дней</strong>. За это время обнови интеграцию на новый ключ.
              </AlertDescription>
            </Alert>
          )}

          <div>
            <label className="text-sm font-medium mb-2 block">Полный ключ</label>
            <div className="relative">
              <div className="font-mono text-xs sm:text-sm bg-muted p-4 rounded-lg break-all border-2 border-primary/30 select-all">
                {plainKey}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-2 right-2"
                onClick={copyKey}
              >
                {copiedKey ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                <span className="ml-1 text-xs">{copiedKey ? 'Скопировано' : 'Копировать'}</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Хеш ключа сохранён в БД. Полный ключ нигде не хранится — после закрытия окна его уже нельзя восстановить.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Пример использования (curl)</label>
            <div className="relative">
              <pre className="font-mono text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                {curlSnippet}
              </pre>
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-2 right-2"
                onClick={copyCurl}
              >
                {copiedCurl ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <Alert>
            <AlertDescription className="text-sm space-y-2">
              <p><strong>Куда сохранить ключ:</strong></p>
              <ul className="list-disc list-inside ml-2 space-y-1 text-xs">
                <li>В переменную окружения вашего AI-агента (например, <code className="text-primary">GEOTIME_API_KEY</code>)</li>
                <li>В secrets.config / .env (НЕ коммитить в git)</li>
                <li>В защищённое хранилище (Vault, Secret Manager и т.п.)</li>
              </ul>
              <p className="text-orange-600 dark:text-orange-400">
                <strong>Не отправляйте ключ в чат, не вставляйте в скриншоты, не публикуйте на GitHub.</strong>
              </p>
            </AlertDescription>
          </Alert>

          <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm">
              Я сохранил ключ в надёжное место. Понимаю, что после закрытия окна его уже нельзя будет увидеть.
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <Button onClick={handleClose} disabled={!acknowledged}>
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
