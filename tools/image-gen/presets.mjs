// サイトの写真枠ごとのプリセット（内容は 写真リスト.md に合わせている）。
// サイト側の CSS は object-fit: cover なので、比率が多少違っても枠に合わせて切り抜かれる。
//
// openaiSize : OpenAI が出せるサイズ（1024x1024 / 1536x1024 / 1024x1536）から近いもの
// geminiAspect: Imagen が出せる比率（1:1 / 3:4 / 4:3 / 9:16 / 16:9）から近いもの
//
// profile（柳沢さん本人の写真）と ogp（店名入りのシェア画像）は、
// 本人の写真・実際の文字入れが必要なので、ここには入れていない。

const STYLE =
  "Natural window light through sheer curtains, before opening hours, calm and quiet. " +
  "Muted, low-saturation palette of off-white paper, charcoal ink and persimmon-tannin brown. " +
  "Shot on a full-frame camera, 35mm lens, realistic photo, soft shadows, no text, no logos, no watermark.";

export const PRESETS = {
  hero: {
    file: "hero",
    openaiSize: "1024x1536",
    geminiAspect: "3:4",
    prompt:
      "Vertical photo of a small Japanese hair salon styling station by a large window. " +
      "Mirror, salon chair and a potted plant, shot slightly wide. The window sits in the upper third of the frame, " +
      "leaving calm empty space in the lower part. No people, or only a hairdresser's hands or back. " +
      STYLE,
  },
  "service-meo": {
    file: "service-meo",
    openaiSize: "1536x1024",
    geminiAspect: "4:3",
    prompt:
      "Close-up of hands holding a smartphone showing a local business listing page with a map and reviews, " +
      "screen text blurred and unreadable. At the reception counter of a small hair salon. " +
      STYLE,
  },
  "service-web": {
    file: "service-web",
    openaiSize: "1536x1024",
    geminiAspect: "16:9",
    prompt:
      "Wide interior shot of an empty small hair salon before opening, salon chairs lined up along the windows. " +
      "Floor and ceiling visible to show the space. Perfectly level horizon, straight vertical lines. " +
      STYLE,
  },
  "service-ai": {
    file: "service-ai",
    openaiSize: "1536x1024",
    geminiAspect: "4:3",
    prompt:
      "Two people talking in the back room of a hair salon while looking at a laptop, " +
      "hands, papers and a notebook on the table. Faces partly out of frame. " +
      STYLE,
  },
  band: {
    file: "band",
    openaiSize: "1536x1024",
    geminiAspect: "16:9",
    prompt:
      "Close-up of a tidy hairdresser's trolley before opening: scissors, combs, clips and brushes neatly arranged. " +
      "Composition spread horizontally, nothing important in the center (will be cropped to a thin 3:1 strip). " +
      "Slightly dark, moody exposure. " +
      STYLE,
  },
};
