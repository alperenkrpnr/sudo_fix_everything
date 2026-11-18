-- Denetim izi yalnızca eklenir (ADR-0002). Uygulanma: src/server/db/schema.ts (db push sonrası).
CREATE OR REPLACE FUNCTION denetim_kaydi_yalnizca_ekle() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Denetim izi yalnizca eklenir: silme yasak';
  END IF;
  IF OLD."arsivlendi" IS NULL
     AND NEW."arsivlendi" IS NOT NULL
     AND (to_jsonb(NEW) - 'arsivlendi') = (to_jsonb(OLD) - 'arsivlendi') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Denetim izi yalnizca eklenir: degistirme yasak';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS denetim_kaydi_yalnizca_ekle ON "DenetimKaydi";
CREATE TRIGGER denetim_kaydi_yalnizca_ekle
  BEFORE UPDATE OR DELETE ON "DenetimKaydi"
  FOR EACH ROW EXECUTE FUNCTION denetim_kaydi_yalnizca_ekle();
