// Task durum değiştirme yetkisi (ADR-0001; ticket 04).
import type { Task } from '@prisma/client';
import type { Tx } from '../../db/client';
import { roller, ustYoneticiler, uyeOlduguEkipler } from './cozumleme';
import { ekipYonetebilir } from './yonetim';

/**
 * - 'TAM': Assignee (kişi ya da Assignee Ekibi'nin üyesi), Sorumlu yönetici ve Üst yöneticiler, Direktör.
 * - 'IPTAL': yalnızca Requester (başka yetkisi yoksa) — sadece İptal edebilir.
 * - null: durum değiştiremez.
 */
export async function taskDurumYetkisi(tx: Tx, kullaniciId: string, task: Task, t: Date): Promise<'TAM' | 'IPTAL' | null> {
  if ((await roller(tx, kullaniciId, t)).includes('DIREKTOR')) return 'TAM';
  if (task.assigneeKullaniciId) {
    if (task.assigneeKullaniciId === kullaniciId) return 'TAM';
    if ((await ustYoneticiler(tx, task.assigneeKullaniciId, t)).includes(kullaniciId)) return 'TAM';
  }
  if (task.assigneeEkipId) {
    if ((await uyeOlduguEkipler(tx, kullaniciId, t)).includes(task.assigneeEkipId)) return 'TAM';
    if (await ekipYonetebilir(tx, kullaniciId, task.assigneeEkipId, t)) return 'TAM';
  }
  return task.requesterId === kullaniciId ? 'IPTAL' : null;
}
