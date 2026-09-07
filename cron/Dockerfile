FROM alpine:3.20

RUN apk add --no-cache dcron tini curl tzdata
# The digest job is scheduled at a specific local hour (20:00) - without
# this, crond runs on UTC and the hour would drift with DST twice a year.
ENV TZ=Europe/Paris

WORKDIR /app
COPY refresh.sh /app/refresh.sh
COPY digest.sh /app/digest.sh
RUN chmod +x /app/refresh.sh /app/digest.sh

COPY crontab /etc/crontabs/root

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["crond", "-f", "-l", "2"]
