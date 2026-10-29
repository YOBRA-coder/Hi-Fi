# Paste into the hEX terminal (WinBox > New Terminal), after replacing the 3 values in CAPITALS.
# 1) tunnel to the VPS
/interface wireguard add name=wg-tellnet listen-port=13231
/interface wireguard print
#    ^ copy the "public-key" of wg-tellnet and run on the VPS:  bash deploy/add-router.sh <that key>
/interface wireguard peers add interface=wg-tellnet public-key="VPS_PUBLIC_KEY" endpoint-address=VPS_PUBLIC_IP endpoint-port=51820 allowed-address=10.88.0.1/32 persistent-keepalive=25s
/ip address add address=10.88.0.2/24 interface=wg-tellnet

# 2) let TellNet (and only it) use the REST API through the tunnel
/ip service set www disabled=no port=80 address=10.88.0.1/32
/ip firewall filter add chain=input in-interface=wg-tellnet src-address=10.88.0.1 protocol=tcp dst-port=80 action=accept place-before=0 comment="TellNet REST over tunnel"
/ip firewall filter add chain=input in-interface=wg-tellnet protocol=icmp action=accept place-before=0 comment="tunnel ping"

# 3) a dedicated API user for TellNet (change the password!)
/user group add name=tellnet policy=read,write,api,rest-api,test,policy,sensitive
/user add name=tellnet group=tellnet password="CHANGE_THIS_PASSWORD" address=10.88.0.1/32
