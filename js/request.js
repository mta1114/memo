// Claude'a gönderilecek "yeni paket isteği" mesajını hazırlar
import { S } from './store.js';

export const WORD_FORMAT = `KELİME DOSYASI BİÇİMİ (düz .txt, UTF-8):
#deste: Deste adı
#seviye: B1
fransızca | türkçe | tür | örnek cümle | örnek cümlenin türkçesi
- Her satır bir kelime. Sadece ilk iki alan zorunlu.
- İsimler artikelle yazılır: "la maison", "l'eau", "le/la collègue".
- Tür değerleri: eril, dişil, eril-çoğul, dişil-çoğul, eril/dişil, fiil, sıfat, zarf, bağlaç, edat, zamir, ifade, sayı, ünlem
- Düzensiz dişil halli sıfatlar: "beau, belle" | güzel | sıfat
- Dönüşlü fiiller: "s'évaporer" | buharlaşmak | fiil
Örnek:
#deste: Kimya
#seviye: B2
le bécher | beher | eril | On verse l'acide dans le bécher. | Asidi behere döküyoruz.`;

export const TEXT_FORMAT = `METİN PAKETİ BİÇİMİ (düz .txt, UTF-8). Her metin "=== METİN ===" satırıyla başlar:
=== METİN ===
#başlık: Une expérience au laboratoire
#seviye: B2
#konu: Kimya
#metin:
Birinci paragraf... Boşluk olacak kelimeler [[çift köşeli parantez]] içinde.

İkinci paragraf (paragraflar arasında boş satır).

Üçüncü paragraf.
#çoktan-seçmeli:
1. Soru?
a) şık
b) doğru şık *
c) şık
d) şık
#açıklama: Kısa Türkçe açıklama.
(5 soru)
#açık-uçlu:
1. Soru (Fransızca)?
#örnek-cevap: Fransızca örnek cevap.
#anahtar-kelimeler: kelime1, kelime2, kelime3
(5 soru)
#sözlük:
çekimli biçim = sözlük hali        (ör. versé = verser)
fransızca | türkçe | tür | örnek | çeviri   (metinde geçen ve tıklanınca açıklanması gereken kelimeler)
Kurallar: 3 paragraf, toplam 220-320 kelime; 10-15 boşluk; 5 çoktan seçmeli (4 şık, tek doğru, yıldızla işaretli); 5 açık uçlu (Fransızca, metinden cevaplanabilir); kısaltma ve « » tırnak kullanma (cümle bölmeyi bozar).`;

function stats() {
  const done = S.texts.filter(t => t.done && t.results);
  const avg = (k, tot) => {
    const xs = done.filter(t => t.results[tot]).map(t => t.results[k] / t.results[tot]);
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) + '%' : '—';
  };
  return { done, mcq: avg('mcq', 'mcqTotal'), open: avg('open', 'openTotal'), gaps: avg('gaps', 'gapTotal') };
}

function hardWords(n = 30) {
  return [...S.words.values()].filter(w => (w.wrong || 0) > 0).sort((a, b) => b.wrong - a.wrong).slice(0, n).map(w => w.fr);
}

export function requestMessage(kind) {
  const st = stats();
  const levels = [...new Set(S.texts.map(t => t.level).filter(Boolean))].join(', ') || 'B1, B2';
  const topics = [...new Set(S.texts.map(t => t.topic).filter(Boolean))].join(', ') || 'Günlük hayat, Kimya';
  const titles = S.texts.map(t => t.title);
  const hard = hardWords();
  const unk = S.meta.unknown || [];
  if (kind === 'texts') {
    return `Merhaba Claude! "Mémo" adlı Fransızca öğrenme uygulamam için YENİ BİR METİN PAKETİ hazırlar mısın? Lütfen 15-20 metinlik tek bir .txt dosyası oluştur.

Seviyeler: ${levels}
Konular: ${topics} (kimya metinleri olsun; diğer konuları çeşitlendir)
Başarı oranlarım: dinleme çoktan seçmeli ${st.mcq}, açık uçlu ${st.open}, boşluk doldurma ${st.gaps}. Zorluğu buna göre ayarla.

Bu başlıklar uygulamada zaten var, TEKRARLAMA:
${titles.map(t => '- ' + t).join('\n') || '- (yok)'}

En çok zorlandığım kelimeler (yeni metinlerde ve boşluklarda kullan):
${hard.join(', ') || '(henüz yok)'}

Sözlükte bulamadığım kelimeler (metinlerin #sözlük bölümünde Türkçe anlamlarıyla ver):
${unk.join(', ') || '(yok)'}

${TEXT_FORMAT}

Fransızcanın ve Türkçe çevirilerin doğru olmasına dikkat et; metinde geçen çekimli fiil biçimlerini #sözlük bölümünde "biçim = mastar" olarak eşle.`;
  }
  const decks = S.decks.map(d => `${d.name} (${[...S.words.values()].filter(w => w.deckId === d.id).length} kelime)`).join(', ');
  return `Merhaba Claude! "Mémo" adlı Fransızca öğrenme uygulamam için YENİ BİR KELİME PAKETİ hazırlar mısın? Tek bir .txt dosyası oluştur.

Mevcut destelerim: ${decks}
İstediğim: [buraya yaz — ör. "B2 seviyesinden 100 yeni kelime" ya da "organik kimya terimleri, 60 tane"]
Zorlandığım kelimeler (bunları tekrar ekleme, ama benzer kelimelere yer ver): ${hard.join(', ') || '(henüz yok)'}
Sözlükte bulamadığım kelimeler (bunları da ekle): ${unk.join(', ') || '(yok)'}

${WORD_FORMAT}

Her kelime için kısa, doğal bir örnek cümle ve Türkçe çevirisini ekle. Uygulamadaki kelimeleri tekrarlama.`;
}
