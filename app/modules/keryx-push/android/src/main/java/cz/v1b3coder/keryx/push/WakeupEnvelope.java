package cz.v1b3coder.keryx.push;

import com.google.gson.Strictness;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import java.io.StringReader;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;
import org.bouncycastle.util.encoders.Base64;

final class WakeupEnvelope {
    static JSONObject parse(String payload) throws Exception {
        try (JsonReader reader = new JsonReader(new StringReader(payload))) {
            reader.setStrictness(Strictness.STRICT);
            JSONObject result = new JSONObject();
            Set<String> fields = new HashSet<>();
            reader.beginObject();
            while (reader.hasNext()) {
                String name = reader.nextName();
                if (!fields.add(name)) throw new IllegalArgumentException("duplicate member");
                switch (name) {
                    case "v":
                    case "seq":
                        if (reader.peek() != JsonToken.NUMBER) throw new IllegalArgumentException("not a number");
                        String number = reader.nextString();
                        if (!number.matches("[1-9][0-9]*")) throw new IllegalArgumentException("not an integer");
                        result.put(name, Long.parseLong(number));
                        break;
                    case "t":
                        result.put(name, string(reader, "[A-Za-z0-9_-]{43}"));
                        break;
                    case "sig":
                        JSONArray signatures = new JSONArray();
                        reader.beginArray();
                        while (reader.hasNext()) {
                            JSONObject sig = new JSONObject();
                            Set<String> members = new HashSet<>();
                            reader.beginObject();
                            while (reader.hasNext()) {
                                String member = reader.nextName();
                                if (!members.add(member)) throw new IllegalArgumentException("duplicate signature member");
                                if (member.equals("keyid")) sig.put(member, string(reader, "[0-9a-f]{64}"));
                                else if (member.equals("sig")) {
                                    String encoded = string(reader, "[A-Za-z0-9_-]{86}");
                                    byte[] bytes = decodeSignature(encoded);
                                    String canonical = Base64.toBase64String(bytes).replace('+', '-').replace('/', '_').replace("=", "");
                                    if (!canonical.equals(encoded)) throw new IllegalArgumentException("noncanonical signature");
                                    sig.put(member, encoded);
                                } else throw new IllegalArgumentException("unknown signature member");
                            }
                            reader.endObject();
                            if (members.size() != 2) throw new IllegalArgumentException("missing signature member");
                            signatures.put(sig);
                        }
                        reader.endArray();
                        if (signatures.length() == 0) throw new IllegalArgumentException("no signatures");
                        result.put(name, signatures);
                        break;
                    default: throw new IllegalArgumentException("unknown member");
                }
            }
            reader.endObject();
            if (fields.size() != 4 || reader.peek() != JsonToken.END_DOCUMENT ||
                    result.getLong("v") != 1 || result.getLong("seq") > 9007199254740991L) {
                throw new IllegalArgumentException("invalid envelope");
            }
            return result;
        }
    }

    private static String string(JsonReader reader, String pattern) throws Exception {
        if (reader.peek() != JsonToken.STRING) throw new IllegalArgumentException("not a string");
        String value = reader.nextString();
        if (!value.matches(pattern)) throw new IllegalArgumentException("malformed encoding");
        return value;
    }

    static byte[] decodeSignature(String value) {
        return Base64.decode(value.replace('-', '+').replace('_', '/') + "==");
    }
}
