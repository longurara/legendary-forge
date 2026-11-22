"""
Dựng asset cho Lò Rèn Huyền Thoại bằng Blender (chạy không cần giao diện):

  blender -b --factory-startup --python blender/build_assets.py -- <thư mục xuất> <thư mục ảnh xem trước>
  (mặc định xuất ra blender/output; chép anvil.glb, slime_lava.glb sang public/models nếu muốn dùng bản mới)

Tạo ra:
  player.glb      thợ rèn (bản cũ, game hiện dùng hiệp sĩ KayKit)
  anvil.glb       đe rèn đặt trên gốc cây, có búa và phôi thép nung đỏ
  slime_lava.glb  slime Quaternius phủ vỏ đá núi lửa, giữ nguyên xương + animation
"""
import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = argv[0] if len(argv) > 0 else os.path.join(HERE, 'output')
PREVIEW = argv[1] if len(argv) > 1 else os.path.join(HERE, 'previews')
os.makedirs(OUT, exist_ok=True)
os.makedirs(PREVIEW, exist_ok=True)
SLIME_SRC = os.path.join(HERE, '..', 'public', 'models', 'slime.glb')


# ---------------------------------------------------------------- tiện ích
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(7)


def material(name, color, rough=0.75, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    if getattr(m, 'node_tree', None) is None:
        m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    m.diffuse_color = (*color, 1)   # màu hiển thị cho ảnh xem trước
    return m


def finish(obj, mat=None, bevel=0.0, smooth=False, segments=2):
    """Áp scale, gán vật liệu, thêm bevel cho cạnh mềm."""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)
    if mat:
        obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
    for p in obj.data.polygons:
        p.use_smooth = smooth
    return obj


def cube(name, loc, half, mat, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = half
    return finish(o, mat, bevel)


def cyl(name, loc, r, depth, mat, rot=(0, 0, 0), verts=12, bevel=0.0, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    return finish(o, mat, bevel)


def sphere(name, loc, r, mat, scale=(1, 1, 1), seg=16, rings=10, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    return finish(o, mat, smooth=smooth)


def rock(name, loc, size, mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size, location=loc)
    o = bpy.context.active_object
    o.name = name
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for v in bm.verts:
        v.co *= 0.75 + random.random() * 0.5
    bm.to_mesh(o.data)
    bm.free()
    o.scale = (1, 1, 0.6 + random.random() * 0.3)
    o.rotation_euler = (random.random() * 3, random.random() * 3, random.random() * 3)
    return finish(o, mat)


def join_meshes(name):
    """Áp modifier rồi gộp mọi mesh thành 1 object (nhẹ cho game)."""
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    return obj


def export(filename):
    path = os.path.join(OUT, filename)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True)
    print('EXPORTED', path, os.path.getsize(path), 'bytes')


def scene_bounds():
    pts = []
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def render_preview(filename):
    """Ảnh xem trước 3/4 từ phía trước (Workbench, nhanh, chạy được khi không có giao diện)."""
    scene = bpy.context.scene
    lo, hi = scene_bounds()
    center = (lo + hi) / 2
    size = max((hi - lo).x, (hi - lo).y, (hi - lo).z)
    cam_data = bpy.data.cameras.new('PreviewCam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = size * 1.35
    cam = bpy.data.objects.new('PreviewCam', cam_data)
    scene.collection.objects.link(cam)
    direction = Vector((0.75, -1.0, 0.55)).normalized()
    cam.location = center + direction * size * 3
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.render.filepath = os.path.join(PREVIEW, filename)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    print('PREVIEW', scene.render.filepath)


# ---------------------------------------------------------------- thợ rèn
def build_player():
    reset()
    skin = material('Skin', (0.93, 0.68, 0.5), 0.6)
    shirt = material('Shirt', (0.62, 0.2, 0.14), 0.8)
    pants = material('Pants', (0.2, 0.19, 0.24), 0.9)
    leather = material('Leather', (0.38, 0.22, 0.11), 0.7)
    dark = material('DarkLeather', (0.16, 0.09, 0.05), 0.8)
    gold = material('Brass', (0.85, 0.62, 0.2), 0.3, 0.9)
    beard = material('Beard', (0.62, 0.28, 0.08), 0.9)
    cloth = material('Bandana', (0.12, 0.22, 0.45), 0.8)
    black = material('Eyes', (0.03, 0.03, 0.03), 0.3)

    # Mặt trước nhìn về -Y (sẽ thành +Z trong glTF)
    for s in (-1, 1):
        cube(f'Boot{s}', (0.14 * s, -0.04, 0.07), (0.1, 0.16, 0.07), dark, 0.03)
        cyl(f'Leg{s}', (0.14 * s, 0, 0.45), 0.09, 0.66, pants, verts=10)
        cyl(f'UpperArm{s}', (0.37 * s, 0.0, 1.12), 0.085, 0.34, shirt, rot=(0, 0.18 * s, 0), verts=10)
        cyl(f'Forearm{s}', (0.41 * s, -0.04, 0.83), 0.072, 0.3, skin, rot=(0.15, 0.06 * s, 0), verts=10)
        cube(f'Bracer{s}', (0.41 * s, -0.045, 0.78), (0.085, 0.085, 0.07), leather, 0.02)
        sphere(f'Hand{s}', (0.42 * s, -0.07, 0.63), 0.085, skin, (1, 1, 1.1), seg=10, rings=8)
        sphere(f'Shoulder{s}', (0.31 * s, 0, 1.28), 0.13, shirt, seg=12, rings=8)
        sphere(f'Ear{s}', (0.235 * s, 0.0, 1.6), 0.05, skin, (0.6, 1, 1), seg=8, rings=6)
        sphere(f'Eye{s}', (0.085 * s, -0.215, 1.63), 0.032, black, seg=8, rings=6)
        cube(f'Brow{s}', (0.09 * s, -0.22, 1.69), (0.05, 0.015, 0.014), beard, rot=(0, -0.2 * s, 0))
        cube(f'ApronStrap{s}', (0.14 * s, -0.2, 1.2), (0.028, 0.012, 0.13), leather, 0.004)

    cube('Torso', (0, 0, 1.03), (0.29, 0.19, 0.3), shirt, 0.08)
    cube('Belly', (0, -0.04, 0.88), (0.27, 0.19, 0.14), shirt, 0.08)
    cube('Hips', (0, 0, 0.77), (0.27, 0.18, 0.08), pants, 0.04)
    cube('Apron', (0, -0.205, 0.84), (0.23, 0.02, 0.36), leather, 0.015)
    cube('ApronPocket', (0, -0.23, 0.72), (0.12, 0.012, 0.08), dark, 0.01)
    cube('Belt', (0, 0, 0.8), (0.3, 0.205, 0.04), dark, 0.01)
    cube('Buckle', (0, -0.235, 0.8), (0.055, 0.015, 0.04), gold, 0.008)
    cyl('Neck', (0, 0, 1.38), 0.09, 0.14, skin, verts=10)
    sphere('Head', (0, 0, 1.6), 0.235, skin, (1, 0.95, 1.02))
    sphere('Nose', (0, -0.235, 1.58), 0.045, skin, (1, 0.9, 1.1), seg=8, rings=6)
    sphere('BeardMain', (0, -0.11, 1.45), 0.19, beard, (1.05, 0.75, 1.1), seg=12, rings=8)
    cyl('BeardTip', (0, -0.17, 1.29), 0.11, 0.2, beard, rot=(math.pi + 0.25, 0, 0), verts=8, r2=0.01)
    cube('Mustache', (0, -0.23, 1.53), (0.1, 0.03, 0.026), beard, 0.015)
    sphere('Bandana', (0, 0.0, 1.7), 0.25, cloth, (1, 1, 0.6))
    sphere('BandanaKnot', (0, 0.235, 1.67), 0.05, cloth, (1, 1, 0.8), seg=8, rings=6)
    cyl('BandanaTail', (0.04, 0.27, 1.58), 0.035, 0.16, cloth, rot=(0.4, 0.3, 0), verts=6, r2=0.01)
    # Búa đeo bên hông
    cyl('HammerHandle', (-0.33, 0.05, 0.68), 0.022, 0.38, leather, rot=(0, -0.12, 0), verts=8)
    cube('HammerHead', (-0.31, 0.05, 0.89), (0.05, 0.1, 0.045), material('Iron', (0.25, 0.26, 0.29), 0.45, 0.85), 0.01)

    join_meshes('Blacksmith')
    render_preview('player.png')
    export('player.glb')


# ---------------------------------------------------------------- đe rèn
def build_anvil():
    reset()
    wood = material('Stump', (0.36, 0.21, 0.1), 0.9)
    wood_top = material('StumpTop', (0.62, 0.45, 0.28), 0.85)
    iron = material('AnvilIron', (0.14, 0.15, 0.17), 0.4, 0.85)
    iron_light = material('AnvilFace', (0.42, 0.43, 0.46), 0.25, 0.9)
    hot = material('HotSteel', (1.0, 0.35, 0.05), 0.4, 0.2, emit=(1.0, 0.35, 0.03), strength=6)
    handle = material('Handle', (0.45, 0.28, 0.13), 0.8)
    band = material('IronBand', (0.2, 0.2, 0.22), 0.5, 0.8)

    cyl('Stump', (0, 0, 0.25), 0.46, 0.5, wood, verts=14, bevel=0.02)
    cyl('StumpTop', (0, 0, 0.505), 0.44, 0.012, wood_top, verts=14)
    cyl('Band', (0, 0, 0.12), 0.47, 0.05, band, verts=14)
    for i in range(5):
        a = i / 5 * math.tau + 0.3
        cyl(f'Root{i}', (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.06), 0.09, 0.14, wood, verts=6, r2=0.03)

    cube('Base', (0, 0, 0.56), (0.27, 0.21, 0.05), iron, 0.02)
    cube('Waist', (0, 0, 0.67), (0.14, 0.12, 0.08), iron, 0.02)
    cube('Body', (0.05, 0, 0.79), (0.42, 0.16, 0.06), iron, 0.025)
    cube('Face', (0.08, 0, 0.855), (0.36, 0.15, 0.008), iron_light, 0.005)
    cyl('Horn', (-0.52, 0, 0.8), 0.14, 0.38, iron, rot=(0, -math.pi / 2, 0), verts=12, r2=0.015)
    cube('Heel', (0.5, 0, 0.8), (0.06, 0.12, 0.045), iron, 0.015)
    cube('Ingot', (0.12, -0.02, 0.885), (0.2, 0.045, 0.022), hot, 0.01)
    # búa nằm nghiêng trên đe
    cyl('HammerHandle', (0.2, 0.3, 0.9), 0.025, 0.5, handle, rot=(0, math.pi / 2, 0.35), verts=8)
    cube('HammerHead', (-0.04, 0.22, 0.9), (0.055, 0.11, 0.05), iron, 0.01, rot=(0, 0, 0.35))

    join_meshes('Anvil')
    render_preview('anvil.png')
    export('anvil.glb')


# ---------------------------------------------------------------- slime dung nham
def build_lava_slime():
    reset()
    bpy.ops.import_scene.gltf(filepath=SLIME_SRC)
    arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name == 'Slime')
    # Bỏ quả cầu phụ không dùng (nếu có)
    for o in list(bpy.context.scene.objects):
        if o.type == 'MESH' and o is not body and o.parent is None:
            bpy.data.objects.remove(o)

    # Thân: cam đỏ, tự phát sáng như dung nham
    for slot in body.material_slots:
        m = slot.material
        if m and m.name.startswith('Body'):
            bsdf = m.node_tree.nodes.get('Principled BSDF')
            bsdf.inputs['Base Color'].default_value = (0.95, 0.3, 0.05, 1)
            bsdf.inputs['Emission Color'].default_value = (1.0, 0.28, 0.02, 1)
            bsdf.inputs['Emission Strength'].default_value = 1.6
            bsdf.inputs['Roughness'].default_value = 0.5
            m.diffuse_color = (0.95, 0.3, 0.05, 1)

    basalt = material('Basalt', (0.07, 0.055, 0.05), 1.0)
    ember = material('Ember', (1.0, 0.55, 0.1), 0.5, emit=(1.0, 0.45, 0.05), strength=5)

    lo = Vector((-1.29, -1.53, 0.0))
    hi = Vector((1.26, 1.53, 1.95))
    pts = [body.matrix_world @ Vector(c) for c in body.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    h = hi.z - lo.z
    w = (hi.x - lo.x) / 2

    # Vỏ đá trên đỉnh và lưng (lưng = +Y, mặt = -Y)
    placements = [(0.0, 0.05, 1.0, 0.24)]
    for i in range(7):
        a = i / 7 * math.tau + 0.4
        r = w * (0.42 + random.random() * 0.12)
        x, y = math.cos(a) * r, math.sin(a) * r * 0.9 + w * 0.12
        if y < -w * 0.25:          # chừa mặt ra cho thấy mắt
            y = -w * 0.25 + (y + w * 0.25) * 0.2
        placements.append((x / w, y / w, 0.86 + random.random() * 0.06, 0.15 + random.random() * 0.07))
    rocks = []
    for i, (fx, fy, fz, fs) in enumerate(placements):
        loc = Vector((fx * w, fy * w, lo.z + fz * h))
        rocks.append(rock(f'Crust{i}', loc, fs * w, basalt))
    for i in range(5):
        a = random.random() * math.tau
        loc = Vector((math.cos(a) * w * 0.3, math.sin(a) * w * 0.3 + w * 0.1, lo.z + h * (0.95 + random.random() * 0.04)))
        rocks.append(sphere(f'Ember{i}', loc, w * 0.045, ember, seg=8, rings=6))

    # Gắn đá vào xương thân để chuyển động theo animation
    bone = 'Body' if 'Body' in arm.data.bones else arm.data.bones[0].name
    for o in rocks:
        mw = o.matrix_world.copy()
        o.parent = arm
        o.parent_type = 'BONE'
        o.parent_bone = bone
        o.matrix_world = mw

    render_preview('slime_lava.png')
    export('slime_lava.glb')


if __name__ == '__main__':
    build_player()
    build_anvil()
    build_lava_slime()
    print('DONE')
