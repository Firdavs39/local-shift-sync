import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

// =============================================================================
// Privacy Policy
// =============================================================================
// Mandatory for both Apple App Store Review and Google Play. Apple is
// especially strict about apps requesting background location — every
// permission needs a plain-language justification and a URL where the user
// can read the policy in full. This page is that URL.
//
// Update copy here, not in Info.plist / strings.xml. Translation hooks can
// be wired in later.
// =============================================================================

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold">Политика конфиденциальности</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Card className="p-6 md:p-8 space-y-6 text-sm leading-relaxed">
          <p className="text-muted-foreground">Последнее обновление: 14 мая 2026 г.</p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Какие данные мы собираем</h2>
            <p>
              <strong>Учётные данные:</strong> имя, код компании, PIN. Используются исключительно для входа в систему.
              PIN хранится только в зашифрованном виде на стороне сервера, мы его не видим.
            </p>
            <p>
              <strong>Геолокация:</strong> широта, долгота и точность сигнала GPS, полученные с устройства во время
              активной смены. Координаты сохраняются в момент старта смены и завершения; в промежутке между ними мы
              используем координаты только для проверки, находитесь ли вы в радиусе объекта, и не сохраняем их в БД.
            </p>
            <p>
              <strong>Метаданные смен:</strong> время начала, время окончания, время на паузе, количество выходов за
              радиус. Это нужно для расчёта зарплаты и дисциплинарных отчётов работодателю.
            </p>
            <p>
              <strong>Чего мы НЕ собираем:</strong> историю перемещений вне смены, контакты, фото, аудио, список
              установленных приложений, рекламные идентификаторы.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Почему нужен фоновый доступ к геолокации</h2>
            <p>
              Учёт рабочего времени должен работать, когда ваш телефон лежит в кармане с выключенным экраном.
              Без разрешения "Всегда" (или эквивалента) операционная система выключит наш мониторинг через 30 секунд
              после блокировки экрана, и приложение перестанет автоматически приостанавливать смену при вашем выходе с объекта.
              Это приведёт к неверному подсчёту минут.
            </p>
            <p>
              Фоновый доступ <strong>используется только во время активной смены</strong>. Между сменами ни один
              запрос координат не отправляется. Когда смена закрывается (вами или автоматически по графику), отслеживание
              немедленно прекращается.
            </p>
            <p>
              На Android мы показываем постоянное уведомление "GeoTime: смена идёт на объекте «…»" — это требование
              системы для долгих фоновых задач, и оно делает прозрачным, что отслеживание активно.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Кто видит ваши данные</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Вы сами</strong> — в разделе «Мои смены».</li>
              <li><strong>Администратор вашей компании</strong> — в админ-панели и отчётах.</li>
              <li><strong>Никто извне.</strong> Мы не продаём данные, не передаём рекламным сетям, не используем для
                  целевой рекламы. Доступ к базе данных ограничен сотрудниками GeoTime для технической поддержки.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Где хранятся данные</h2>
            <p>
              Серверы Supabase в регионе EU (Франкфурт, Германия). Соединение всегда по TLS.
              Резервные копии шифруются и хранятся не дольше 30 дней.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Сколько данные хранятся</h2>
            <p>
              Записи смен хранятся в течение срока, заданного администратором компании (по умолчанию 365 дней). По
              истечении срока — автоматически удаляются. Учётная запись удаляется по запросу администратора.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Ваши права</h2>
            <p>Вы можете запросить:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Копию всех данных, которые мы храним о вас</li>
              <li>Исправление неверных данных</li>
              <li>Удаление учётной записи и всех связанных данных</li>
            </ul>
            <p>
              Запросы направляйте администратору вашей компании или на адрес, указанный ниже.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Дети</h2>
            <p>
              GeoTime предназначен для людей старше 16 лет. Мы не собираем сознательно данные несовершеннолетних.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Изменения в политике</h2>
            <p>
              Если мы изменим эту политику, новая версия появится здесь с обновлённой датой. Существенные изменения
              мы дополнительно сообщаем через приложение.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Контакт</h2>
            <p>
              Вопросы и запросы — на адрес поддержки вашей компании или через администратора. Для разработчиков:
              GitHub <a href="https://github.com/Firdavs39/local-shift-sync" className="text-primary underline">
              Firdavs39/local-shift-sync</a>.
            </p>
          </section>
        </Card>
      </main>
    </div>
  );
}
