package cz.v1b3coder.keryx.push;

import java.nio.file.Files;
import java.nio.file.Paths;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class WakeupVerifyTest {
    private JSONObject fixture() throws Exception {
        return new JSONObject(new String(Files.readAllBytes(Paths.get(System.getProperty("keryx.fixture"))), "UTF-8"));
    }

    private WakeupVerify gate(JSONObject fixture) throws Exception {
        JSONObject topic = new JSONObject().put("keys", fixture.getJSONArray("keys"))
                .put("threshold", fixture.getInt("threshold")).put("expiresAt", 4070908800000L)
                .put("label", "Security alerts").put("lastSeq", 0);
        WakeupVerify gate = new WakeupVerify();
        gate.setState(new JSONObject().put("topics", new JSONObject().put(fixture.getString("topic"), topic)));
        return gate;
    }

    @Test public void verifiesGoArtifactAndPersistsReplay() throws Exception {
        JSONObject f = fixture();
        String payload = f.getJSONObject("wakeup").toString();
        WakeupVerify gate = gate(f);
        assertEquals("Security alerts", gate.verify(payload).label);
        assertNull(gate.verify(payload));
        WakeupVerify restored = new WakeupVerify();
        restored.setState(gate.toJson());
        assertNull(restored.verify(payload));
    }

    @Test public void rejectsExpiredAuthorization() throws Exception {
        JSONObject f = fixture();
        WakeupVerify original = gate(f);
        JSONObject state = original.toJson();
        state.getJSONObject("topics").getJSONObject(f.getString("topic")).put("expiresAt", 1);
        original.setState(state);
        assertNull(original.verify(f.getJSONObject("wakeup").toString()));
    }

    @Test public void rejectsMalformedAndTamperedSignedEnvelopes() throws Exception {
        JSONObject f = fixture();
        String payload = f.getJSONObject("wakeup").toString();
        String[] rejected = {
            payload.replace("\"v\":1", "\"v\":1,\"v\":1"),
            payload.replace("\"v\":1", "\"v\":1,\"\\u0076\":1"),
            payload.replace("\"v\":1", "\"v\":\"1\""),
            payload.replace("\"v\":1", "\"v\":1.0"),
            payload.replace("\"v\":1", "\"v\":1e0"),
            payload.replace("\"v\":1", "\"v\":true"),
            payload.substring(0, payload.length() - 1) + ",\"extra\":true}",
            payload.replace("\"seq\":" + f.getLong("seq"), "\"seq\":1"),
            payload.replace("\"keyid\":", "\"extra\":true,\"keyid\":"),
            payload + " trailing"
        };
        for (String invalid : rejected) assertNull(invalid, gate(f).verify(invalid));
    }
}
