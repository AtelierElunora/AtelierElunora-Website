// Brand font files already used by the Atelier Elunora iPhone app.
export const SAVE_DATE_FONTS = [
  {
    "id": "script",
    "label": "Atelier Script",
    "family": "Elunora Edwardian",
    "file": "atelier-script.otf",
    "characters": " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſƒǼǽǾǿȘșȚțȷˆˇˉ˘˙˚˛˜˝ΩμπẀẁẂẃẄẅỲỳ–—‘’‚“”„†‡•…‰‹›⁄⁰⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉€ℓ™Ω℮⅓⅔⅛⅜⅝⅞∂∆∏∑−∕∙√∞∫≈≠≤≥◊ﬀﬁﬂﬃﬄ￿"
  },
  {
    "id": "modern",
    "label": "Atelier Modern",
    "family": "Elunora Brown Carolina",
    "file": "atelier-modern.otf",
    "characters": " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ ¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĪīĬĭĮįİıĴĵĶķĹĺĻļĽľĿŀŁłŃńŅņŇňŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžǼǽǾǿȘş̶̨̦̦̀́̂̃̄̆̇̈̊̋̌̍̒ẀẁẂẃẄẅẞỲỳ–—‘’‚“”„†‡•…‰‹›⁄€™−≤≥￿"
  }
] as const;
export type SaveDateFont = typeof SAVE_DATE_FONTS[number]['id'];
export const fontFor = (id:SaveDateFont) => SAVE_DATE_FONTS.find(f=>f.id===id)!;
export const fontSupports = (text:string,id:SaveDateFont) => Array.from(text.normalize('NFC')).every(c=>fontFor(id).characters.includes(c));
export const pointUnits = (points:number) => points * 1000 / 180;
export const LETTERING_WIDTH = 840, LETTERING_HEIGHT = 160;
