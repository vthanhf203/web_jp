const VOCAB_CATEGORY_LABELS: Record<string, string> = {
  xung_ho_chao_hoi: "Xưng hô, chào hỏi",
  con_nguoi_than_phan_nghe_nghiep: "Con người, thân phận, nghề nghiệp",
  truong_hoc_hoc_tap: "Trường học, học tập",
  do_vat_thiet_bi: "Đồ vật, thiết bị",
  dia_diem_phuong_huong_vi_tri: "Địa điểm, phương hướng, vị trí",
  thoi_gian_lich_tan_suat: "Thời gian, lịch, tần suất",
  hoat_dong_hanh_dong: "Hoạt động, hành động",
  di_chuyen_giao_thong: "Di chuyển, giao thông",
  gia_dinh_moi_quan_he: "Gia đình, mối quan hệ",
  an_uong_nau_an: "Ăn uống, nấu ăn",
  co_the_suc_khoe: "Cơ thể, sức khỏe",
  tu_nhien_thoi_tiet: "Tự nhiên, thời tiết",
  mau_sac_tinh_chat_cam_xuc: "Màu sắc, tính chất, cảm xúc",
  so_dem_don_vi: "Số đếm, đơn vị",
  khac: "Khác",
};

function stripVietnameseMarks(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizeLookupKey(value: string): string {
  return stripVietnameseMarks(value)
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, "_")
    .replace(/_+/g, "_");
}

export function formatVocabLabel(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) {
    return value;
  }

  const normalizedKey = normalizeLookupKey(value);
  const mappedLabel = VOCAB_CATEGORY_LABELS[normalizedKey];
  if (mappedLabel) {
    return mappedLabel;
  }

  const baiMatch = /^bai[_\-\s]*(\d+)$/i.exec(normalizedKey);
  if (baiMatch?.[1]) {
    return `Bài ${Number(baiMatch[1])}`;
  }

  const lessonMatch = /^lesson[_\-\s]*(\d+)$/i.exec(normalizedKey);
  if (lessonMatch?.[1]) {
    return `Lesson ${Number(lessonMatch[1])}`;
  }

  if (/[_\-]/.test(value)) {
    return value.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  }

  return value;
}
