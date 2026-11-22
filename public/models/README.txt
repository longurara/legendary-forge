Thả file .glb vào thư mục này với đúng tên dưới đây, game sẽ tự dùng thay cho model dựng bằng code
(tải lại trang là thấy). Thiếu file nào thì game dùng model mặc định cho file đó.

  player.glb             nhân vật chính (cần có xương + animation kiểu KayKit)
  slime.glb              slime thường / nhỏ / to
  slime_lava.glb         slime dung nham
  enemy_mage.glb         pháp sư xương (animation kiểu KayKit)
  anvil.glb              đe rèn
  weapon_sword.glb       kiếm      weapon_axe.glb         rìu
  weapon_greatsword.glb  đại kiếm  weapon_staff.glb       trượng
  dungeon/*.glb          các mảnh hầm ngục (danh sách trong src/models.js)

Game tự co giãn và xoay model cho vừa (vũ khí: trục dài nhất thành lưỡi).
Nên nén trước khi dùng để game nhẹ:
  npx @gltf-transform/cli optimize input.glb public/models/slime.glb --simplify-ratio 0.02 --texture-size 1024
