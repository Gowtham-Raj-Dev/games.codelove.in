import * as THREE from "three";

/** Records the bind pose so animation clips can be rescaled to this avatar's proportions. */
export function recordRestPose(root: THREE.Object3D) {
  root.traverse((o) => {
    o.userData.restPosition = o.position.clone();
  });
}

function findTargetNode(nodeName: string, root: THREE.Object3D): THREE.Object3D | null {
  // 1. Exact match
  const direct = root.getObjectByName(nodeName);
  if (direct) return direct;

  // 2. Prefix variations: Bip01 vs Bip001 vs Bip02 vs Bip03
  const bipMatch = nodeName.match(/^Bip\d+\s*(.*)$/i);
  if (bipMatch) {
    const suffix = bipMatch[1].trim().toLowerCase();
    let found: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (found) return;
      const lower = o.name.toLowerCase();
      if (/^bip\d+/i.test(lower) && (lower.endsWith(suffix) || lower.includes(suffix))) {
        found = o;
      }
    });
    if (found) return found;

    // 3. Humanoid joint mapping for custom rigs (e.g. Kratos GoW 3)
    const humanoidMap: Record<string, RegExp> = {
      pelvis: /root hips|pelvis|hips/i,
      spine: /spine 1|spine1|spine/i,
      spine1: /spine 2|spine1|spine/i,
      spine2: /spine 3|spine2|chest/i,
      neck: /head neck lower|neck/i,
      head: /head neck upper|head/i,
      "l clavicle": /arm left shoulder 1|left.*clavicle/i,
      "l upperarm": /arm left shoulder 2|left.*upper.*arm|arm.*left.*shoulder/i,
      "l forearm": /arm left elbow|left.*forearm/i,
      "l hand": /arm left wrist|left.*hand/i,
      "r clavicle": /arm right shoulder 1|right.*clavicle/i,
      "r upperarm": /arm right shoulder 2|right.*upper.*arm|arm.*right.*shoulder/i,
      "r forearm": /arm right elbow|right.*forearm/i,
      "r hand": /arm right wrist|right.*hand/i,
      "l thigh": /leg left thigh|left.*thigh|left.*up.*leg/i,
      "l calf": /leg left knee|left.*calf|left.*leg/i,
      "l foot": /leg left ankle|left.*foot/i,
      "r thigh": /leg right thigh|right.*thigh|right.*up.*leg/i,
      "r calf": /leg right knee|right.*calf|right.*leg/i,
      "r foot": /leg right ankle|right.*foot/i,
    };

    const matcher = humanoidMap[suffix];
    if (matcher) {
      root.traverse((o) => {
        if (!found && matcher.test(o.name)) {
          found = o;
        }
      });
      if (found) return found;
    }
  }

  return null;
}

/**
 * Rocketbox clips only animate bone rotations plus the Biped root (Bip01) translation.
 * The root translation is re-expressed relative to this avatar's own rest height, so the same clip
 * works for a 1.9 m adult and a 1.3 m child without floating or sinking.
 */
export function retarget(clip: THREE.AnimationClip, root: THREE.Object3D): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
    const targetNode = findTargetNode(nodeName, root);
    if (!targetNode) continue;
    const name = `${targetNode.name}.${propertyName}`;
    const times = Array.from(track.times);
    if (propertyName === "position") {
      const rest = (targetNode.userData.restPosition as THREE.Vector3 | undefined) ?? targetNode.position;
      const values = Float32Array.from(track.values);
      const [x0, y0, z0] = values;
      const scale = Math.abs(y0) > 1e-3 ? rest.y / y0 : 1;
      for (let i = 0; i < values.length; i += 3) {
        values[i] = rest.x + (values[i] - x0) * scale;
        values[i + 1] = rest.y + (values[i + 1] - y0) * scale;
        values[i + 2] = rest.z + (values[i + 2] - z0) * scale;
      }
      tracks.push(new THREE.VectorKeyframeTrack(name, times, Array.from(values)));
    } else if (propertyName === "quaternion") {
      tracks.push(new THREE.QuaternionKeyframeTrack(name, times, Array.from(track.values)));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
